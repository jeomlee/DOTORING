// src/screens/ForestScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoIcon from '../components/DotoIcon';
import DotoText from '../components/DotoText';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string; // YYYY-MM-DD
  status: string; // 'active' | 'used' | ...
  image_url?: string | null;
};

type Props = { navigation: any };

type Chip = 'week' | 'month' | 'all';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ForestScreen({ navigation }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<Chip>('week');
  const fade = useRef(new Animated.Value(0)).current;

  const today = useMemo(() => dayjs().startOf('day'), []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      Alert.alert('로그인이 필요해요', '다시 로그인해주세요.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('오류', error.message);
      setLoading(false);
      return;
    }

    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);

    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoupons();
    setRefreshing(false);
  };

  const derived = useMemo(() => {
    const list = coupons;

    const isExpired = (c: Coupon) =>
      c.status !== 'used' && dayjs(c.expire_date).diff(today, 'day') < 0;

    const isActive = (c: Coupon) =>
      c.status !== 'used' && dayjs(c.expire_date).diff(today, 'day') >= 0;

    const isUsed = (c: Coupon) => c.status === 'used';

    const used = list.filter(isUsed);
    const expired = list.filter(isExpired);
    const active = list.filter(isActive);

    const from = (() => {
      if (range === 'week') return today.subtract(6, 'day');
      if (range === 'month') return today.subtract(29, 'day');
      return null;
    })();

    const inRange = (d: string) => {
      if (!from) return true;
      const dt = dayjs(d).startOf('day');
      return dt.isAfter(from.subtract(1, 'day')) && dt.isBefore(today.add(1, 'day'));
    };

    // used는 사용일이 DB에 없어서 만료일 기준
    const usedR = used.filter((c) => inRange(c.expire_date));
    const expiredR = expired.filter((c) => inRange(c.expire_date));

    return {
      used,
      expired,
      active,
      usedR,
      expiredR,
      activeCount: active.length,
      usedCount: used.length,
      expiredCount: expired.length,
    };
  }, [coupons, today, range]);

  const forestTokens = useMemo(() => {
    const trees = derived.expiredR.map((c) => ({
      id: c.id,
      type: 'tree' as const,
      title: c.title,
      date: c.expire_date,
    }));
    const eats = derived.usedR.map((c) => ({
      id: c.id,
      type: 'eat' as const,
      title: c.title,
      date: c.expire_date,
    }));

    const MAX = range === 'week' ? 18 : range === 'month' ? 36 : 60;

    return [...trees, ...eats]
      .sort((a, b) => dayjs(b.date).diff(dayjs(a.date), 'day'))
      .slice(0, MAX);
  }, [derived.expiredR, derived.usedR, range]);

  const vibeText = useMemo(() => {
    const wTrees = derived.expiredR.length;
    const wEats = derived.usedR.length;

    if (loading) return '숲을 정리하는 중...';
    if (derived.activeCount === 0 && derived.usedCount === 0 && derived.expiredCount === 0)
      return '아직 숲이 비어있어요. 도토리를 한 번 모아볼까요?';

    if (wTrees === 0 && wEats === 0) return '최근에는 조용하네요. 숲이 잠깐 쉬고 있어요.';
    if (wTrees > wEats) return `이번엔 숲이 조금 더 자랐어요. (${wTrees} 그루)`;
    if (wEats > wTrees) return `이번엔 네가 더 많이 냠냠했어요. (${wEats} 한입)`;
    return '이번엔 숲과 한입이 균형이네요.';
  }, [derived, loading]);

  const renderChip = (key: Chip, label: string) => {
    const active = range === key;
    return (
      <TouchableOpacity
        onPress={() => setRange(key)}
        activeOpacity={0.85}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: active ? '#FFFFFF' : '#F3E9DD',
          marginRight: 8,
          borderWidth: active ? 1 : 0,
          borderColor: '#E5E0D8',
          minHeight: 34, // ✅ 폰트 스케일에도 칩 높이 안정
          justifyContent: 'center',
        }}
      >
        <DotoText
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            fontSize: 12,
            fontFamily: 'PretendardBold',
            color: active ? colors.text : '#8F7E6C',
          }}
        >
          {label}
        </DotoText>
      </TouchableOpacity>
    );
  };

  const StatCard = ({
    title,
    value,
    hint,
    icon,
    onPress,
  }: {
    title: string;
    value: number;
    hint: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 18,
        padding: 14,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
        elevation: 2,
        minHeight: 118, // ✅ 카드 높이 출렁임 방지(폰트 스케일)
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </DotoText>
        <Ionicons name={icon} size={16} color={colors.subtext} />
      </View>

      <DotoText
        style={{
          marginTop: 10,
          fontSize: 22,
          fontFamily: 'PretendardBold',
          color: colors.text,
        }}
        numberOfLines={1}
      >
        {value}
      </DotoText>

      <DotoText
        style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {hint}
      </DotoText>
    </TouchableOpacity>
  );

  const ForestMap = () => {
    const size = range === 'week' ? 6 : range === 'month' ? 8 : 10;
    const cell = clamp(Math.floor(320 / size), 26, 42);

    if (!forestTokens.length) {
      return (
        <View
          style={{
            backgroundColor: '#FFF',
            borderRadius: 18,
            padding: 16,
            marginTop: 12,
          }}
        >
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            아직 숲에 기록이 없어요.
          </DotoText>
          <DotoText style={{ marginTop: 6, fontSize: 12, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
            도토리를 쓰면 “냠냠”, 놓치면 “나무”로 남아요.
          </DotoText>
        </View>
      );
    }

    return (
      <View
        style={{
          marginTop: 12,
          backgroundColor: '#FFF',
          borderRadius: 18,
          padding: 12,
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            도토리 숲 지도
          </DotoText>

          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1}>
              🌳 {derived.expiredR.length} · 😋
            </DotoText>
            <DotoIcon size={14} style={{ marginHorizontal: 4 }} />
            <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1}>
              {derived.usedR.length}
            </DotoText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {forestTokens.map((t) => (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CouponDetail', { couponId: t.id })}
              style={{
                width: cell,
                height: cell,
                alignItems: 'center',
                justifyContent: 'center',
                margin: 3,
                borderRadius: 10,
                backgroundColor: t.type === 'tree' ? '#F3EFE8' : '#F2E0CC',
              }}
            >
              {t.type === 'tree' ? (
                <DotoText style={{ fontSize: 16 }} numberOfLines={1}>
                  🌳
                </DotoText>
              ) : (
                <DotoIcon size={18} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <DotoText style={{ marginTop: 10, fontSize: 12, color: colors.subtext }} numberOfLines={1}>
          터치하면 해당 도토리로 이동해요.
        </DotoText>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <Animated.ScrollView
        style={{ flex: 1, opacity: fade }}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={{ marginBottom: 10 }}>
          <DotoText style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            도토리 숲 🌲
          </DotoText>
          <DotoText style={{ marginTop: 4, fontSize: 12, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
            잃어버린 도토리는 숲이 되고, 챙긴 도토리는 냠냠했어요.
          </DotoText>
        </View>

        {/* 기간 칩 */}
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {renderChip('week', '최근 7일')}
          {renderChip('month', '최근 30일')}
          {renderChip('all', '전체')}
        </View>

        {/* 분위기 문장 */}
        <View
          style={{
            backgroundColor: '#F3E9DD',
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 6,
            minHeight: 44, // ✅ 박스 높이 흔들림 방지
            justifyContent: 'center',
          }}
        >
          <DotoText style={{ fontSize: 13, color: colors.text }} numberOfLines={2} ellipsizeMode="tail">
            {vibeText}
          </DotoText>
        </View>

        {/* 스탯 카드 */}
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <StatCard
            title="내가 냠냠한 도토리"
            value={derived.usedCount}
            hint="사용 완료로 남은 기록이에요."
            icon="happy-outline"
          />
          <View style={{ width: 10 }} />
          <StatCard
            title="숲이 된 도토리"
            value={derived.expiredCount}
            hint="놓친 것들이 나무가 됐어요."
            icon="leaf-outline"
          />
        </View>

        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <StatCard
            title="아직 남은 도토리"
            value={derived.activeCount}
            hint="지금 챙길 수 있는 도토리예요."
            icon="time-outline"
            onPress={() => navigation.navigate('Box')}
          />
        </View>

        {/* 숲 지도 */}
        <ForestMap />

        {/* CTA */}
        <View
          style={{
            marginTop: 14,
            backgroundColor: '#FFF',
            borderRadius: 18,
            padding: 14,
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowOffset: { width: 0, height: 2 },
            shadowRadius: 6,
            elevation: 1,
          }}
        >
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            숲을 줄이는 가장 쉬운 방법
          </DotoText>
          <DotoText style={{ marginTop: 6, fontSize: 12, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
            오늘 화면 확인만 해도, 숲이 되는 걸 막을 수 있어요.
          </DotoText>

          <TouchableOpacity
            onPress={() => navigation.navigate('Today')}
            activeOpacity={0.85}
            style={{
              marginTop: 12,
              backgroundColor: '#F3E9DD',
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: 'center',
              minHeight: 40, // ✅ 버튼 높이 고정
              justifyContent: 'center',
            }}
          >
            <DotoText style={{ fontSize: 13, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
              오늘 화면으로 가기
            </DotoText>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>
    </ScreenContainer>
  );
}
