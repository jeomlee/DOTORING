// src/screens/DotorihamScreen.tsx
import React, { useState, useCallback, useRef, useMemo } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';
import DotoTextInput from '../components/DotoTextInput';
import { resolveCouponImageUrl } from '../utils/imageUrls';
import { deleteCouponFully } from '../utils/deleteCouponFully';

// ✅ 도토리함 타이틀 아이콘
import DOTORING_ICON from '../assets/DOTORING.png';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: string;
  image_url?: string | null;
  displayImageUrl?: string | null;
};

type Props = { navigation: any };

const ITEM_HEIGHT = 120;
const ITEM_SPACING = 14;
const ROW_HEIGHT = ITEM_HEIGHT + ITEM_SPACING * 2;

type StatusFilter = 'all' | 'active' | 'expiring7' | 'used' | 'expired';

export default function DotorihamScreen({ navigation }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const scrollY = useRef(new Animated.Value(0)).current;
  const today = useMemo(() => dayjs().startOf('day'), []);

  // ✅ 현재 열린 Swipeable 하나만 관리
  const openSwipeRef = useRef<Swipeable | null>(null);

  // ✅ signed URL 캐시 (image_url key -> signedUrl or null)
  const signedUrlCacheRef = useRef<Map<string, string | null>>(new Map());

  // ✅ 중복 resolve 방지
  const resolvingRef = useRef<Set<string>>(new Set());

  const closeOpenSwipe = useCallback(() => {
    try {
      (openSwipeRef.current as any)?.close?.();
    } catch {}
    openSwipeRef.current = null;
  }, []);

  const updateDisplayUrlById = useCallback((couponId: string, displayUrl: string | null) => {
    setCoupons((prev) => {
      const idx = prev.findIndex((c) => c.id === couponId);
      if (idx < 0) return prev;

      const target = prev[idx];
      if (target.displayImageUrl === displayUrl) return prev;

      const next = [...prev];
      next[idx] = { ...target, displayImageUrl: displayUrl };
      return next;
    });
  }, []);

  const ensureImageResolved = useCallback(
    async (item: Coupon) => {
      const key = item.image_url ?? null;
      if (!key) return;

      if (item.displayImageUrl) return;

      if (signedUrlCacheRef.current.has(key)) {
        const cached = signedUrlCacheRef.current.get(key) ?? null;
        updateDisplayUrlById(item.id, cached);
        return;
      }

      if (resolvingRef.current.has(key)) return;
      resolvingRef.current.add(key);

      try {
        const url = await resolveCouponImageUrl(key);
        signedUrlCacheRef.current.set(key, url ?? null);
        updateDisplayUrlById(item.id, url ?? null);
      } catch {
        signedUrlCacheRef.current.set(key, null);
        updateDisplayUrlById(item.id, null);
      } finally {
        resolvingRef.current.delete(key);
      }
    },
    [updateDisplayUrlById]
  );

  const fetchCoupons = useCallback(async () => {
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const user = sess?.session?.user;

    if (!user) {
      Alert.alert('로그인이 필요해', '다시 로그인해줘.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('coupons')
      .select('id,title,category,memo,expire_date,status,image_url')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('오류', error.message);
      setLoading(false);
      return;
    }

    const todayLocal = dayjs().startOf('day');

    const sorted = ((data as Coupon[]) ?? []).sort((a, b) => {
      const aDiff = dayjs(a.expire_date).diff(todayLocal, 'day');
      const bDiff = dayjs(b.expire_date).diff(todayLocal, 'day');

      const aUsed = a.status === 'used';
      const bUsed = b.status === 'used';
      const aExpired = !aUsed && aDiff < 0;
      const bExpired = !bUsed && bDiff < 0;

      const rank = (active: boolean, expired: boolean, used: boolean) => {
        if (active) return 0;
        if (expired) return 1;
        if (used) return 2;
        return 3;
      };

      const aRank = rank(!aUsed && aDiff >= 0, aExpired, aUsed);
      const bRank = rank(!bUsed && bDiff >= 0, bExpired, bUsed);
      if (aRank !== bRank) return aRank - bRank;

      return dayjs(a.expire_date).diff(dayjs(b.expire_date), 'day');
    });

    const withCachedImages = sorted.map((item) => {
      const key = item.image_url ?? null;
      if (!key) return { ...item, displayImageUrl: null };

      if (signedUrlCacheRef.current.has(key)) {
        return { ...item, displayImageUrl: signedUrlCacheRef.current.get(key) ?? null };
      }
      return { ...item, displayImageUrl: null };
    });

    setCoupons(withCachedImages);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCoupons();
      return () => closeOpenSwipe();
    }, [fetchCoupons, closeOpenSwipe])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCoupons();
    setRefreshing(false);
  }, [fetchCoupons]);

  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const hit =
          c.title.toLowerCase().includes(q) ||
          (c.category ?? '').toLowerCase().includes(q) ||
          (c.memo ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }

      const diff = dayjs(c.expire_date).diff(today, 'day');
      const notExpired = diff >= 0;

      switch (statusFilter) {
        case 'active':
          return c.status !== 'used' && notExpired;
        case 'expiring7':
          return c.status !== 'used' && notExpired && diff <= 7;
        case 'used':
          return c.status === 'used';
        case 'expired':
          return c.status !== 'used' && diff < 0;
        case 'all':
        default:
          return true;
      }
    });
  }, [coupons, searchText, statusFilter, today]);

  const getDdayInfo = useCallback(
    (expireDate: string, status: string) => {
      const expire = dayjs(expireDate);
      const diff = expire.diff(today, 'day');

      let label = '';
      let color = colors.primary;
      let badgeBg = '#EFE2D3';

      if (status === 'used') {
        label = '사용 완료';
        color = colors.accent;
        badgeBg = '#DCE8D7';
      } else if (diff < 0) {
        label = '지나감';
        color = '#8F7E6C';
        badgeBg = '#EFE7DF';
      } else if (diff === 0) {
        label = 'D-DAY';
        color = '#C7773A';
        badgeBg = '#F2E0CC';
      } else if (diff <= 3) {
        label = `D-${diff}`;
        color = '#C7773A';
        badgeBg = '#F2E0CC';
      } else if (diff <= 7) {
        label = `D-${diff}`;
        color = '#8A6E37';
        badgeBg = '#E9DFC7';
      } else {
        label = `D-${diff}`;
        color = colors.primary;
        badgeBg = '#E4D6C5';
      }

      return { label, color, badgeBg, expireText: expire.format('YYYY.MM.DD') };
    },
    [today]
  );

  const onDelete = useCallback(
    (item: Coupon) => {
      Alert.alert('삭제할까?', '이 도토리는 삭제하면 복구할 수 없어.', [
        { text: '취소', style: 'cancel', onPress: () => closeOpenSwipe() },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            closeOpenSwipe();

            setCoupons((prev) => prev.filter((c) => c.id !== item.id));

            try {
              await deleteCouponFully({ couponId: item.id, image_url: item.image_url });
              if (item.image_url) signedUrlCacheRef.current.delete(item.image_url);
            } catch (e: any) {
              Alert.alert('삭제 실패', e?.message ?? '삭제에 실패했어.');
              fetchCoupons();
            }
          },
        },
      ]);
    },
    [closeOpenSwipe, fetchCoupons]
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
        <DotoText style={{ marginTop: 4, fontSize: 12, fontFamily: 'PretendardBold', color: '#fff' }} numberOfLines={1}>
          삭제
        </DotoText>
      </TouchableOpacity>
    ),
    [onDelete]
  );

  const segmentCounts = useMemo(() => {
    const activeCount = coupons.filter(
      (c) => c.status !== 'used' && dayjs(c.expire_date).diff(today, 'day') >= 0
    ).length;
    const expiring7Count = coupons.filter(
      (c) =>
        c.status !== 'used' &&
        dayjs(c.expire_date).diff(today, 'day') >= 0 &&
        dayjs(c.expire_date).diff(today, 'day') <= 7
    ).length;
    const usedCount = coupons.filter((c) => c.status === 'used').length;
    const expiredCount = coupons.filter(
      (c) => c.status !== 'used' && dayjs(c.expire_date).diff(today, 'day') < 0
    ).length;

    return { activeCount, expiring7Count, usedCount, expiredCount };
  }, [coupons, today]);

  const renderItem = useCallback(
    ({ item, index }: { item: Coupon; index: number }) => {
      const { label, color, badgeBg, expireText } = getDdayInfo(item.expire_date, item.status);

      const inputRange = [-1, 0, ROW_HEIGHT * index, ROW_HEIGHT * (index + 2)];
      const scale = scrollY.interpolate({ inputRange, outputRange: [1, 1, 1, 0.96] });
      const opacity = scrollY.interpolate({ inputRange, outputRange: [1, 1, 1, 0.4] });

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
          <Animated.View style={{ transform: [{ scale }], opacity, marginHorizontal: 4, marginVertical: ITEM_SPACING }}>
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
                  {item.displayImageUrl ? (
                    <Image
                      source={{ uri: item.displayImageUrl }}
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
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: '#F2E6D7',
                          alignSelf: 'flex-start',
                        }}
                      >
                        <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                          {item.category || '기타'}
                        </DotoText>
                      </View>

                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: badgeBg }}>
                        <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color }} numberOfLines={1}>
                          {label}
                        </DotoText>
                      </View>
                    </View>

                    <DotoText
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={{ fontSize: 15, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 4, lineHeight: 20 }}
                    >
                      {item.title}
                    </DotoText>

                    {item.memo ? (
                      <DotoText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: colors.subtext }}>
                        {item.memo}
                      </DotoText>
                    ) : (
                      <DotoText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: '#B3A89C' }}>
                        메모를 남겨두면 나중에 더 편해요.
                      </DotoText>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                      <Ionicons name="calendar-outline" size={14} color={colors.subtext} style={{ marginRight: 4 }} />
                      <DotoText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: colors.subtext }}>
                        {expireText} 까지
                      </DotoText>
                    </View>

                    {item.status === 'used' && (
                      <DotoText style={{ fontSize: 11, color: colors.accent }} numberOfLines={1}>
                        사용 완료 ✅
                      </DotoText>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Swipeable>
      );
    },
    [getDdayInfo, navigation, renderRightActions, scrollY]
  );

  const renderStatusSegmentBar = useCallback(() => {
    const { activeCount, expiring7Count, usedCount, expiredCount } = segmentCounts;

    const segments: { key: StatusFilter; label: string; count: number }[] = [
      { key: 'all', label: '전체', count: coupons.length },
      { key: 'active', label: '사용 가능', count: activeCount },
      { key: 'expiring7', label: '7일 이내', count: expiring7Count },
      { key: 'used', label: '사용 완료', count: usedCount },
      { key: 'expired', label: '지난 도토리', count: expiredCount },
    ];

    return (
      <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#F3E9DD',
            borderRadius: 999,
            padding: 4,
          }}
        >
          {segments.map((seg) => {
            const active = statusFilter === seg.key;
            return (
              <TouchableOpacity
                key={seg.key}
                onPress={() => setStatusFilter(seg.key)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  marginHorizontal: 2,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  minHeight: 44, // ✅ 폰트가 바뀌어도 영역 유지
                }}
                activeOpacity={0.85}
              >
                <DotoText
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ fontSize: 11, fontFamily: 'PretendardBold', color: active ? colors.text : '#8F7E6C' }}
                >
                  {seg.label}
                </DotoText>
                <DotoText
                  numberOfLines={1}
                  style={{ marginTop: 2, fontSize: 12, fontFamily: 'PretendardBold', color: active ? colors.primary : '#8F7E6C' }}
                >
                  {seg.count}
                </DotoText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }, [segmentCounts, coupons.length, statusFilter]);

  const keyExtractor = useCallback((item: Coupon) => item.id, []);

  const getItemLayout = useCallback((_: any, index: number) => {
    return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: Coupon }> }) => {
      const targets = viewableItems.slice(0, 12).map((v) => v.item);
      targets.forEach((it) => {
        ensureImageResolved(it);
      });
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 18,
  }).current;

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        const first = filteredCoupons.slice(0, 10);
        first.forEach((it) => ensureImageResolved(it));
      }, 0);

      return () => clearTimeout(t);
    }, [filteredCoupons, ensureImageResolved])
  );

  return (
    <ScreenContainer>
      <View style={{ flex: 1, paddingTop: 8 }}>
        <View
          style={{
            paddingHorizontal: 4,
            marginBottom: 6,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={DOTORING_ICON}
                style={{ width: 22, height: 22, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory"
              />
              <DotoText style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                도토리함
              </DotoText>
            </View>

            <DotoText
              style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              모아둔 도토리를 검색하고 정리해요.
            </DotoText>
          </View>

          <DotoButton
            title="추가"
            onPress={() => navigation.navigate('AddCoupon')}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}
          />
        </View>

        <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#F3E9DD',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              minHeight: 44, // ✅ 입력/아이콘 영역 안정화
            }}
          >
            <Ionicons name="search-outline" size={18} color={colors.subtext} style={{ marginRight: 6 }} />
            <DotoTextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="제목, 카테고리, 메모 검색"
              placeholderTextColor="#B7AFA5"
              style={{ flex: 1, fontSize: 13, paddingVertical: 0, color: colors.text }}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.85}>
                <Ionicons name="close-circle" size={16} color="#B2A89E" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {renderStatusSegmentBar()}

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
            <DotoText style={{ marginTop: 10, color: colors.subtext }} numberOfLines={1}>
              불러오는 중...
            </DotoText>
          </View>
        ) : (
          <Animated.FlatList
            data={filteredCoupons}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={true}
            getItemLayout={getItemLayout}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
