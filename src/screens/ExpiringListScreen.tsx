// src/screens/ExpiringListScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoButton from '../components/DotoButton';
import { resolveCouponImageUrl } from '../utils/imageUrls';
import { deleteCouponFully } from '../utils/deleteCouponFully';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: string;
  image_url?: string | null;
};

type Props = { navigation: any; route: any };

const ITEM_HEIGHT = 120;

export default function ExpiringListScreen({ navigation, route }: Props) {
  const preset: 'today' | 'urgent' | 'soon' = route?.params?.preset ?? 'soon';
  const leadDaysParam: number | undefined = route?.params?.leadDays;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [leadDays, setLeadDays] = useState<number>(leadDaysParam ?? 7);

  const [imageCache, setImageCache] = useState<Record<string, string | null>>({});
  const today = useMemo(() => dayjs().startOf('day'), []);

  const openSwipeRef = useRef<Swipeable | null>(null);

  const closeOpenSwipe = () => {
    try {
      (openSwipeRef.current as any)?.close?.();
    } catch {}
    openSwipeRef.current = null;
  };

  const title = useMemo(() => {
    if (preset === 'today') return '오늘 도토리';
    if (preset === 'urgent') return '긴급 도토리';
    return '임박 도토리';
  }, [preset]);

  const hint = useMemo(() => {
    if (preset === 'today') return '오늘 만료되는 도토리만 모아봤어.';
    if (preset === 'urgent') return '3일 이내 만료되는 도토리.';
    return `${leadDays}일 이내 만료되는 도토리.`;
  }, [preset, leadDays]);

  const loadLeadDaysFromSettings = useCallback(async (userId: string) => {
    try {
      const { data: s, error: sErr } = await supabase
        .from('user_settings')
        .select('notify_lead_days')
        .eq('user_id', userId)
        .maybeSingle();

      if (!sErr && s?.notify_lead_days && [1, 3, 7, 10, 30].includes(s.notify_lead_days)) {
        setLeadDays(s.notify_lead_days);
      }
    } catch {}
  }, []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const user = sess?.session?.user;

    if (!user) {
      setLoading(false);
      Alert.alert('로그인이 필요해', '다시 로그인해줘.');
      return;
    }

    if (leadDaysParam == null) await loadLeadDaysFromSettings(user.id);

    const { data, error } = await supabase
      .from('coupons')
      .select('id,title,category,memo,expire_date,status,image_url')
      .eq('user_id', user.id)
      .neq('status', 'used')
      .order('expire_date', { ascending: true });

    if (error) {
      setLoading(false);
      Alert.alert('오류', error.message);
      return;
    }

    const list = (data as Coupon[]) ?? [];

    const filtered = list.filter((c) => {
      const diff = dayjs(c.expire_date).diff(today, 'day');
      if (diff < 0) return false;

      if (preset === 'today') return diff === 0;
      if (preset === 'urgent') return diff <= 3;
      return diff <= leadDays;
    });

    setCoupons(filtered);
    setLoading(false);
  }, [today, preset, leadDays, leadDaysParam, loadLeadDaysFromSettings]);

  useEffect(() => {
    fetchCoupons();
    return () => closeOpenSwipe();
  }, [fetchCoupons]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoupons();
    setRefreshing(false);
  };

  const getDdayInfo = useCallback(
    (expireDate: string) => {
      const diff = dayjs(expireDate).diff(today, 'day');
      const label = diff === 0 ? 'D-DAY' : `D-${diff}`;
      const color = diff === 0 ? '#C7773A' : diff <= 3 ? '#C7773A' : colors.primary;
      const badgeBg = diff === 0 ? '#F2E0CC' : diff <= 3 ? '#F2E0CC' : '#E4D6C5';
      return { label, color, badgeBg, expireText: dayjs(expireDate).format('YYYY.MM.DD') };
    },
    [today]
  );

  const ensureImageResolved = useCallback(
    async (id: string, raw?: string | null) => {
      if (!raw) return;
      if (imageCache[id] !== undefined) return;

      try {
        const resolved = await resolveCouponImageUrl(raw);
        setImageCache((prev) => ({ ...prev, [id]: resolved ?? null }));
      } catch {
        setImageCache((prev) => ({ ...prev, [id]: null }));
      }
    },
    [imageCache]
  );

  const onDelete = async (item: Coupon) => {
    Alert.alert('삭제할까?', '이 도토리는 삭제하면 복구할 수 없어.', [
      { text: '취소', style: 'cancel', onPress: () => closeOpenSwipe() },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            closeOpenSwipe();
            await deleteCouponFully({ couponId: item.id, image_url: item.image_url });
            setCoupons((prev) => prev.filter((c) => c.id !== item.id));
            setImageCache((prev) => {
              const next = { ...prev };
              delete next[item.id];
              return next;
            });
          } catch (e: any) {
            Alert.alert('삭제 실패', e?.message ?? '삭제에 실패했어.');
          }
        },
      },
    ]);
  };

  const renderRightActions = (item: Coupon) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onDelete(item)}
      style={{
        width: 92,
        marginVertical: 10,
        borderRadius: 16,
        backgroundColor: '#C65B5B',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="trash-outline" size={18} color="#fff" />
      <Text style={{ marginTop: 4, fontSize: 12, fontFamily: 'PretendardBold', color: '#fff' }}>
        삭제
      </Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Coupon }) => {
    const { label, color, badgeBg, expireText } = getDdayInfo(item.expire_date);

    const raw = item.image_url ?? null;
    if (raw) ensureImageResolved(item.id, raw);
    const imageUri = imageCache[item.id] ?? null;

    // ✅ 핵심: item별 ref 로컬 보관
    let rowRef: Swipeable | null = null;

    return (
      <Swipeable
        ref={(r) => {
          rowRef = r;
        }}
        onSwipeableWillOpen={() => {
          if (openSwipeRef.current && openSwipeRef.current !== rowRef) {
            try {
              (openSwipeRef.current as any)?.close?.();
            } catch {}
          }
          openSwipeRef.current = rowRef;
        }}
        onSwipeableWillClose={() => {
          if (openSwipeRef.current === rowRef) openSwipeRef.current = null;
        }}
        renderRightActions={() => renderRightActions(item)}
        rightThreshold={40}
        overshootRight={false}
      >
        <View style={{ marginHorizontal: 4, marginVertical: 10 }}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('CouponDetail', { couponId: item.id })}>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#FFF',
                borderRadius: 18,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 10,
                elevation: 3,
              }}
            >
              <View
                style={{
                  width: 120,
                  height: ITEM_HEIGHT,
                  backgroundColor: '#E7DED2',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={120}
                  />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={26} color={colors.subtext} />
                    <Text style={{ fontSize: 11, marginTop: 6, color: colors.subtext }}>이미지 없음</Text>
                  </>
                )}
              </View>

              <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'space-between' }}>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F2E6D7', alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 11, fontFamily: 'PretendardBold', color: colors.text }}>
                        {item.category || '기타'}
                      </Text>
                    </View>

                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: badgeBg }}>
                      <Text style={{ fontSize: 11, fontFamily: 'PretendardBold', color }}>{label}</Text>
                    </View>
                  </View>

                  <Text numberOfLines={2} style={{ fontSize: 15, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 4 }}>
                    {item.title}
                  </Text>

                  {item.memo ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: colors.subtext }}>
                      {item.memo}
                    </Text>
                  ) : (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: '#B3A89C' }}>
                      메모를 남겨두면 나중에 더 편해져.
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="calendar-outline" size={14} color={colors.subtext} style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 12, color: colors.subtext }}>{expireText} 까지</Text>
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  return (
    <ScreenContainer>
      <View style={{ flex: 1, paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 4, marginBottom: 10 }}>
          <Text style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }}>{title}</Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}>{hint}</Text>

          <View style={{ marginTop: 10 }}>
            <DotoButton
              title="도토리함으로 이동"
              onPress={() => navigation.navigate('MainTabs', { screen: 'Box' })}
              style={{ paddingVertical: 10, borderRadius: 14 }}
            />
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.subtext }}>불러오는 중...</Text>
          </View>
        ) : coupons.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Ionicons name="leaf-outline" size={40} color={colors.subtext} />
            <Text style={{ marginTop: 12, fontSize: 15, fontFamily: 'PretendardBold', color: colors.text }}>
              해당 조건의 도토리가 없어.
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
              다른 기준으로도 한번 확인해봐.
            </Text>
          </View>
        ) : (
          <Animated.FlatList
            data={coupons}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24, paddingTop: 4 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
