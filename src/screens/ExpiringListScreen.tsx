// src/screens/ExpiringListScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';
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
const ITEM_SPACING = 10;
const ROW_HEIGHT = ITEM_HEIGHT + ITEM_SPACING * 2;

export default function ExpiringListScreen({ navigation, route }: Props) {
  const preset: 'today' | 'urgent' | 'soon' = route?.params?.preset ?? 'soon';
  const leadDaysParam: number | undefined = route?.params?.leadDays;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [leadDays, setLeadDays] = useState<number>(leadDaysParam ?? 7);

  // ✅ id -> resolved url (null도 캐시)
  const [imageCache, setImageCache] = useState<Record<string, string | null>>({});
  const imageCacheRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    imageCacheRef.current = imageCache;
  }, [imageCache]);

  const today = useMemo(() => dayjs().startOf('day'), []);

  // ✅ swipe open 1개만
  const openSwipeRef = useRef<Swipeable | null>(null);
  const closeOpenSwipe = useCallback(() => {
    try {
      (openSwipeRef.current as any)?.close?.();
    } catch {}
    openSwipeRef.current = null;
  }, []);

  // ✅ resolve 중복 방지
  const resolvingRef = useRef<Set<string>>(new Set());

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
  }, [fetchCoupons, closeOpenSwipe]);

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

  /**
   * ✅ visible item만 resolve (render 중 setState 금지)
   * - id 기준 캐시
   * - resolving 중복 방지
   * - 실패(null)도 캐시
   */
  const ensureImageResolved = useCallback(async (id: string, raw?: string | null) => {
    if (!raw) return;

    // 이미 캐시되어 있으면 끝(null 포함)
    if (imageCacheRef.current[id] !== undefined) return;

    // resolve 중이면 중복 방지
    if (resolvingRef.current.has(id)) return;
    resolvingRef.current.add(id);

    try {
      const resolved = await resolveCouponImageUrl(raw);
      setImageCache((prev) => {
        if (prev[id] !== undefined) return prev;
        return { ...prev, [id]: resolved ?? null };
      });
    } catch {
      setImageCache((prev) => {
        if (prev[id] !== undefined) return prev;
        return { ...prev, [id]: null };
      });
    } finally {
      resolvingRef.current.delete(id);
    }
  }, []);

  const onDelete = useCallback(
    (item: Coupon) => {
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
    },
    [closeOpenSwipe]
  );

  const renderRightActions = useCallback(
    (item: Coupon) => (
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
        <DotoText
          style={{ marginTop: 4, fontSize: 12, fontFamily: 'PretendardBold', color: '#fff' }}
          numberOfLines={1}
        >
          삭제
        </DotoText>
      </TouchableOpacity>
    ),
    [onDelete]
  );

  const renderItem = useCallback(
    ({ item }: { item: Coupon }) => {
      const { label, color, badgeBg, expireText } = getDdayInfo(item.expire_date);
      const imageUri = imageCache[item.id] ?? null;

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
          <View style={{ marginHorizontal: 4, marginVertical: ITEM_SPACING }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('CouponDetail', { couponId: item.id })}
            >
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
                      <DotoText style={{ fontSize: 11, marginTop: 6, color: colors.subtext }} numberOfLines={1}>
                        이미지 없음
                      </DotoText>
                    </>
                  )}
                </View>

                <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'space-between' }}>
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: '#F2E6D7',
                          alignSelf: 'flex-start',
                          minHeight: 22,
                          justifyContent: 'center',
                        }}
                      >
                        <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                          {item.category || '기타'}
                        </DotoText>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: badgeBg,
                          minHeight: 22,
                          justifyContent: 'center',
                        }}
                      >
                        <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color }} numberOfLines={1}>
                          {label}
                        </DotoText>
                      </View>
                    </View>

                    <DotoText
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={{
                        fontSize: 15,
                        fontFamily: 'PretendardBold',
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {item.title}
                    </DotoText>

                    {item.memo ? (
                      <DotoText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: colors.subtext }}>
                        {item.memo}
                      </DotoText>
                    ) : (
                      <DotoText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: '#B3A89C' }}>
                        메모를 남겨두면 나중에 더 편해져.
                      </DotoText>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="calendar-outline" size={14} color={colors.subtext} style={{ marginRight: 4 }} />
                      <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1}>
                        {expireText} 까지
                      </DotoText>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </Swipeable>
      );
    },
    [getDdayInfo, imageCache, navigation, renderRightActions]
  );

  // ✅ 고정 높이 최적화(스크롤 안정)
  const getItemLayout = useCallback((_: any, index: number) => {
    return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
  }, []);

  // ✅ visible 기반 resolve
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: Coupon }> }) => {
      const targets = viewableItems.slice(0, 12).map((v) => v.item);
      targets.forEach((it) => ensureImageResolved(it.id, it.image_url ?? null));
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 18,
  }).current;

  // ✅ 처음 상단 10개 정도는 즉시 resolve해서 “이미지 없음” 체감 감소
  useEffect(() => {
    const t = setTimeout(() => {
      coupons.slice(0, 10).forEach((it) => ensureImageResolved(it.id, it.image_url ?? null));
    }, 0);
    return () => clearTimeout(t);
  }, [coupons, ensureImageResolved]);

  return (
    <ScreenContainer>
      <View style={{ flex: 1, paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 4, marginBottom: 10 }}>
          <DotoText style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            {title}
          </DotoText>
          <DotoText style={{ marginTop: 4, fontSize: 12, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
            {hint}
          </DotoText>

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
            <ActivityIndicator />
            <DotoText style={{ marginTop: 10, color: colors.subtext }} numberOfLines={1}>
              불러오는 중...
            </DotoText>
          </View>
        ) : coupons.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Ionicons name="leaf-outline" size={40} color={colors.subtext} />
            <DotoText
              style={{ marginTop: 12, fontSize: 15, fontFamily: 'PretendardBold', color: colors.text }}
              numberOfLines={1}
            >
              해당 조건의 도토리가 없어.
            </DotoText>
            <DotoText style={{ marginTop: 4, fontSize: 13, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
              다른 기준으로도 한번 확인해봐.
            </DotoText>
          </View>
        ) : (
          <Animated.FlatList
            data={coupons}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24, paddingTop: 4 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}

            // ✅ 성능(UI 변화 없음)
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={true}
            getItemLayout={getItemLayout}

            // ✅ visible 기반 이미지 resolve
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
