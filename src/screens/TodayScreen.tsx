// src/screens/TodayScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  ActionSheetIOS,
  ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

// ✅ 성능: expo-image (디스크 캐시)
import { Image } from 'expo-image';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';

import { resolveCouponImageUrl } from '../utils/imageUrls';

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

const LEAD_OPTIONS = [
  { days: 1, label: '하루 전' },
  { days: 3, label: '3일 전' },
  { days: 7, label: '7일 전' },
  { days: 10, label: '10일 전' },
  { days: 30, label: '한 달 전' },
] as const;

type LeadDays = (typeof LEAD_OPTIONS)[number]['days'];

const ITEM_HEIGHT = 120;
const FETCH_LIMIT = 250;

// ✅ 성능 상수 (UI 영향 없음)
const FETCH_COOLDOWN_MS = 2500; // 포커스 왕복 중복 fetch 방지
const SETTINGS_TTL_MS = 60_000; // leadDays 설정 1분 캐시
const PREFETCH_COUNT = 8; // 오늘 화면에서 미리 resolve할 최대 개수
const RESOLVE_CONCURRENCY = 2; // 동시 resolve 제한(네트워크 튐 방지)

const StatBox = ({
  title,
  value,
  hint,
  tone,
  onPress,
}: {
  title: string;
  value: number;
  hint: string;
  tone: 'danger' | 'warn' | 'normal';
  onPress?: () => void;
}) => {
  const toneStyle =
    tone === 'danger'
      ? { bg: '#F3D7D7', color: '#C65B5B' }
      : tone === 'warn'
      ? { bg: '#F2E0CC', color: '#C7773A' }
      : { bg: '#E4D6C5', color: colors.primary };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ flex: 1 }}>
      <View
        style={{
          backgroundColor: '#FFF',
          borderRadius: 16,
          padding: 12,
          borderWidth: 1,
          borderColor: '#EFE7DF',
        }}
      >
        <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </DotoText>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
          <DotoText style={{ fontSize: 22, fontFamily: 'PretendardBold', color: toneStyle.color }} numberOfLines={1}>
            {value}
          </DotoText>
          <DotoText style={{ marginLeft: 6, fontSize: 12, color: colors.subtext }} numberOfLines={1}>
            개
          </DotoText>
        </View>

        <View style={{ marginTop: 8 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: toneStyle.bg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color: toneStyle.color }} numberOfLines={1}>
              {hint}
            </DotoText>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function TodayScreen({ navigation }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [leadDays, setLeadDays] = useState<LeadDays>(7);
  const [showAllSoon, setShowAllSoon] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // ✅ Animated.Value는 useRef로 고정(리렌더 안정)
  const toastOpacityRef = useRef(new Animated.Value(0));
  const toastOpacity = toastOpacityRef.current;

  const today = useMemo(() => dayjs().startOf('day'), []);

  const leadLabel = useMemo(() => {
    return LEAD_OPTIONS.find((x) => x.days === leadDays)?.label ?? `${leadDays}일 전`;
  }, [leadDays]);

  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(toastOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
            setToast(null);
          });
        }, 900);
      });
    },
    [toastOpacity]
  );

  // ✅ URL 캐시 + 중복 resolve 방지
  const urlCacheRef = useRef<Map<string, string | null>>(new Map());
  const resolvingRef = useRef<Set<string>>(new Set());

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

  const ensureResolved = useCallback(
    async (item: Coupon) => {
      const raw = item.image_url ?? null;

      if (!raw) {
        if (item.displayImageUrl !== null) updateDisplayUrlById(item.id, null);
        return;
      }

      if (item.displayImageUrl) return;

      if (urlCacheRef.current.has(raw)) {
        updateDisplayUrlById(item.id, urlCacheRef.current.get(raw) ?? null);
        return;
      }

      if (resolvingRef.current.has(raw)) return;
      resolvingRef.current.add(raw);

      try {
        const resolved = await resolveCouponImageUrl(raw);
        const finalUrl = resolved ?? null;
        urlCacheRef.current.set(raw, finalUrl);
        updateDisplayUrlById(item.id, finalUrl);

        // ✅ prefetch (지원 시)
        if (finalUrl) {
          try {
            // @ts-ignore
            await Image.prefetch?.(finalUrl);
          } catch {}
        }
      } catch {
        urlCacheRef.current.set(raw, null);
        updateDisplayUrlById(item.id, null);
      } finally {
        resolvingRef.current.delete(raw);
      }
    },
    [updateDisplayUrlById]
  );

  /**
   * ✅ 동시성 제한된 resolve runner (UI 변화 없음)
   */
  const resolveManyLimited = useCallback(
    async (items: Coupon[]) => {
      const queue = items.slice();
      const workers = new Array(RESOLVE_CONCURRENCY).fill(0).map(async () => {
        while (queue.length) {
          const it = queue.shift();
          if (!it) break;
          // eslint-disable-next-line no-await-in-loop
          await ensureResolved(it);
        }
      });
      await Promise.all(workers);
    },
    [ensureResolved]
  );

  // ✅ fetch 최소화: inFlight 공유 + cooldown
  const lastFetchAtRef = useRef(0);
  const inFlightFetchRef = useRef<Promise<void> | null>(null);

  // ✅ settings(leadDays) TTL 캐시
  const leadCacheRef = useRef<{ value: LeadDays; at: number } | null>(null);

  const loadLeadDaysCached = useCallback(
    async (userId: string): Promise<LeadDays> => {
      const cached = leadCacheRef.current;
      const now = Date.now();
      if (cached && now - cached.at < SETTINGS_TTL_MS) return cached.value;

      let lead: LeadDays = leadDays;

      try {
        const { data: s } = await supabase
          .from('user_settings')
          .select('notify_lead_days')
          .eq('user_id', userId)
          .maybeSingle();

        const raw = s?.notify_lead_days;
        if (typeof raw === 'number' && [1, 3, 7, 10, 30].includes(raw)) {
          lead = raw as LeadDays;
          setLeadDays(lead);
        }
      } catch {}

      leadCacheRef.current = { value: lead, at: now };
      return lead;
    },
    [leadDays]
  );

  const fetchData = useCallback(
    async (force = false) => {
      const now = Date.now();

      if (!force) {
        if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;
        if (inFlightFetchRef.current) {
          await inFlightFetchRef.current;
          return;
        }
      }

      const task = (async () => {
        setLoading(true);

        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user;

        if (!user) {
          Alert.alert('로그인이 필요해', '다시 로그인해줘.');
          setLoading(false);
          return;
        }

        const lead = await loadLeadDaysCached(user.id);

        const todayStr = dayjs().format('YYYY-MM-DD');

        const { data, error } = await supabase
          .from('coupons')
          .select('id,title,category,memo,expire_date,status,image_url')
          .eq('user_id', user.id)
          .neq('status', 'used')
          .gte('expire_date', todayStr)
          .order('expire_date', { ascending: true })
          .limit(FETCH_LIMIT);

        if (error) {
          Alert.alert('오류', error.message);
          setLoading(false);
          return;
        }

        const list = ((data as Coupon[]) ?? []).map((c) => {
          const raw = c.image_url ?? null;
          if (!raw) return { ...c, displayImageUrl: null };
          if (urlCacheRef.current.has(raw)) {
            return { ...c, displayImageUrl: urlCacheRef.current.get(raw) ?? null };
          }
          return { ...c, displayImageUrl: null };
        });

        setCoupons(list);
        setLoading(false);
        lastFetchAtRef.current = Date.now();

        try {
          const usable = list;

          const top = usable[0] ?? null;
          const soon = usable.filter((c) => {
            const d = dayjs(c.expire_date).diff(today, 'day');
            return d >= 0 && d <= lead;
          });

          const targets: Coupon[] = [];
          if (top) targets.push(top);
          targets.push(...soon.slice(0, PREFETCH_COUNT));

          await resolveManyLimited(targets);
        } catch (e: any) {
          console.log('[Today] pre-resolve error:', e?.message ?? e);
        }
      })();

      inFlightFetchRef.current = task;
      await task.finally(() => {
        inFlightFetchRef.current = null;
      });
    },
    [loadLeadDaysCached, resolveManyLimited, today]
  );

  useFocusEffect(
    useCallback(() => {
      fetchData(false);
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  const usable = useMemo(() => {
    return coupons.filter((c) => {
      if (c.status === 'used') return false;
      const diff = dayjs(c.expire_date).diff(today, 'day');
      return diff >= 0;
    });
  }, [coupons, today]);

  const todayList = useMemo(
    () => usable.filter((c) => dayjs(c.expire_date).diff(today, 'day') === 0),
    [usable, today]
  );

  const urgentList = useMemo(() => {
    return usable
      .filter((c) => {
        const d = dayjs(c.expire_date).diff(today, 'day');
        return d >= 0 && d <= 3;
      })
      .sort((a, b) => dayjs(a.expire_date).diff(dayjs(b.expire_date), 'day'));
  }, [usable, today]);

  const soonList = useMemo(() => {
    return usable
      .filter((c) => {
        const d = dayjs(c.expire_date).diff(today, 'day');
        return d >= 0 && d <= leadDays;
      })
      .sort((a, b) => dayjs(a.expire_date).diff(dayjs(b.expire_date), 'day'));
  }, [usable, today, leadDays]);

  const topPriority = useMemo(() => {
    const sorted = [...usable].sort((a, b) => {
      const da = dayjs(a.expire_date).diff(today, 'day');
      const db = dayjs(b.expire_date).diff(today, 'day');

      const rank = (d: number) => {
        if (d === 0) return 0;
        if (d <= 3) return 1;
        if (d <= leadDays) return 2;
        return 3;
      };

      const ra = rank(da);
      const rb = rank(db);
      if (ra !== rb) return ra - rb;
      return da - db;
    });

    return sorted[0] ?? null;
  }, [usable, today, leadDays]);

  const soonVisible = useMemo(
    () => (showAllSoon ? soonList : soonList.slice(0, 5)),
    [soonList, showAllSoon]
  );

  React.useEffect(() => {
    const targets = [topPriority, ...soonVisible].filter(Boolean) as Coupon[];
    (async () => {
      await resolveManyLimited(targets);
    })();
  }, [topPriority, soonVisible, resolveManyLimited]);

  const getDdayInfo = (expireDate: string, status: string) => {
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
      label = '만료됨';
      color = '#C65B5B';
      badgeBg = '#F3D7D7';
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
  };

  const openItemActions = (item: Coupon) => {
    const title = item.title;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: ['닫기', '상세로 이동'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) navigation.navigate('CouponDetail', { couponId: item.id });
        }
      );
      return;
    }

    Alert.alert(title, '', [
      { text: '닫기', style: 'cancel' },
      { text: '상세로 이동', onPress: () => navigation.navigate('CouponDetail', { couponId: item.id }) },
    ]);
  };

  const BoxCard = ({ item, enableLongPress }: { item: Coupon; enableLongPress: boolean }) => {
    const { label, color, badgeBg, expireText } = getDdayInfo(item.expire_date, item.status);

    return (
      <View style={{ marginHorizontal: 4, marginVertical: 10 }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('CouponDetail', { couponId: item.id })}
          onLongPress={enableLongPress ? () => openItemActions(item) : undefined}
          delayLongPress={260}
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
                  onError={(e) => {
                    console.log('[Today] card image load error:', (e as any)?.error ?? e);
                  }}
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

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="calendar-outline" size={14} color={colors.subtext} style={{ marginRight: 4 }} />
                  <DotoText numberOfLines={1} style={{ fontSize: 12, color: colors.subtext }}>
                    {expireText} 까지
                  </DotoText>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 26 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View
          style={{
            paddingHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <DotoText style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
              오늘 할 일
            </DotoText>
            <DotoText
              style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {dayjs().format('YYYY.MM.DD')} · 임박 기준: {leadLabel}
            </DotoText>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Settings')}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons name="settings-outline" size={18} color={colors.subtext} />
            <DotoText style={{ marginLeft: 6, fontSize: 12, color: colors.subtext }} numberOfLines={1}>
              설정
            </DotoText>
          </TouchableOpacity>
        </View>

        {/* 퀵 액션 */}
        <View style={{ paddingHorizontal: 12, marginBottom: 10, flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <DotoButton
              title="도토리 추가"
              onPress={() => navigation.navigate('AddCoupon')}
              style={{ paddingVertical: 10, borderRadius: 14 }}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Box')}
            style={{
              width: 56,
              borderRadius: 14,
              backgroundColor: '#F3E9DD',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#E6DED5',
              paddingVertical: 8, // ✅ 작은 글자 커져도 버티게
            }}
          >
            <Ionicons name="file-tray-full-outline" size={18} color={colors.text} />
            <DotoText style={{ marginTop: 2, fontSize: 10, color: colors.text, fontFamily: 'PretendardBold' }} numberOfLines={1}>
              함
            </DotoText>
          </TouchableOpacity>
        </View>

        {/* 요약 */}
        <View style={{ paddingHorizontal: 12, flexDirection: 'row', gap: 10 }}>
          <StatBox
            title="오늘"
            value={todayList.length}
            hint="D-DAY"
            tone="danger"
            onPress={() => navigation.navigate('ExpiringList', { preset: 'today' })}
          />
          <StatBox
            title="긴급"
            value={urgentList.length}
            hint="3일 이내"
            tone="warn"
            onPress={() => navigation.navigate('ExpiringList', { preset: 'urgent' })}
          />
          <StatBox
            title="임박"
            value={soonList.length}
            hint={`${leadDays}일 이내`}
            tone="normal"
            onPress={() => navigation.navigate('ExpiringList', { preset: 'soon', leadDays })}
          />
        </View>

        {/* 오늘의 1순위 */}
        <View style={{ paddingHorizontal: 12, marginTop: 16 }}>
          <DotoText style={{ fontSize: 15, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            오늘의 1순위
          </DotoText>
        </View>

        <View style={{ paddingHorizontal: 8 }}>
          {loading ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ActivityIndicator />
              <DotoText style={{ marginTop: 8, color: colors.subtext }} numberOfLines={1}>
                불러오는 중...
              </DotoText>
            </View>
          ) : !topPriority ? (
            <View style={{ paddingHorizontal: 4, marginTop: 10 }}>
              <View
                style={{
                  backgroundColor: '#FFF',
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#EFE7DF',
                }}
              >
                <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                  급한 도토리가 없어요.
                </DotoText>
                <DotoText style={{ marginTop: 6, fontSize: 12, color: colors.subtext }} numberOfLines={1} ellipsizeMode="tail">
                  필요한 날만 들어와도 충분해요.
                </DotoText>
              </View>
            </View>
          ) : (
            <BoxCard item={topPriority} enableLongPress={false} />
          )}
        </View>

        {/* 임박 리스트 */}
        <View style={{ paddingHorizontal: 12, marginTop: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <DotoText style={{ fontSize: 15, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
              임박한 도토리
            </DotoText>
            <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1}>
              {leadDays}일 이내 {soonList.length}개
            </DotoText>
          </View>

          <View style={{ marginTop: 8 }}>
            {!loading && soonList.length === 0 ? (
              <View
                style={{
                  backgroundColor: '#FFF',
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#EFE7DF',
                }}
              >
                <DotoText style={{ fontSize: 13, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                  임박한 도토리가 없어요.
                </DotoText>
                <DotoText style={{ marginTop: 6, fontSize: 12, color: colors.subtext }} numberOfLines={1} ellipsizeMode="tail">
                  설정한 기준({leadDays}일 이내)에서는 여유롭네요.
                </DotoText>
              </View>
            ) : (
              <>
                {soonVisible
                  .filter((c) => c.id !== topPriority?.id)
                  .map((c) => (
                    <BoxCard key={c.id} item={c} enableLongPress={true} />
                  ))}
              </>
            )}

            {!loading && soonList.length > 6 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowAllSoon((v) => !v)}
                style={{
                  backgroundColor: '#F3E9DD',
                  borderRadius: 14,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#E6DED5',
                  marginTop: 6,
                }}
              >
                <DotoText style={{ fontSize: 12, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
                  {showAllSoon ? '접기' : `더 보기 (+${soonList.length - 5})`}
                </DotoText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 안내 */}
        {!loading && usable.length > 0 && (
          <View style={{ paddingHorizontal: 12, marginTop: 14 }}>
            <View
              style={{
                backgroundColor: '#FBF7F2',
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: '#EFE7DF',
              }}
            >
              <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
                * “임박”은 설정한 알림 시점(현재 {leadDays}일 전)을 기준으로 자동 계산돼요.
              </DotoText>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 토스트 */}
      {toast && (
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 14,
            alignItems: 'center',
            opacity: toastOpacity,
          }}
        >
          <View
            style={{
              backgroundColor: '#2B2B2B',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
            }}
          >
            <DotoText style={{ color: '#FFF', fontSize: 12, fontFamily: 'PretendardBold' }} numberOfLines={2} ellipsizeMode="tail">
              {toast}
            </DotoText>
          </View>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}
