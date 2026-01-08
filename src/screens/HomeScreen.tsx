// src/screens/HomeScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Image,
  Animated,
  TextInput,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import DotoButton from '../components/DotoButton';
import DotoIcon from '../components/DotoIcon';
import { attachDisplayImageUrls } from '../utils/imageUrls';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string; // 'YYYY-MM-DD'
  status: string; // 'active' | 'used' | ...
  image_url?: string | null;
  displayImageUrl?: string | null;
};

type Props = {
  navigation: any;
};

const ITEM_HEIGHT = 120;
const ITEM_SPACING = 14;
const ROW_HEIGHT = ITEM_HEIGHT + ITEM_SPACING * 2;

type StatusFilter = 'all' | 'active' | 'expiring7' | 'used' | 'expired';

export default function HomeScreen({ navigation }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const scrollY = useRef(new Animated.Value(0)).current;

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      Alert.alert('로그인이 필요해', '다시 로그인해줘.');
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

    const sorted = (data as Coupon[]).sort((a, b) => {
      const aHasImage = !!a.image_url;
      const bHasImage = !!b.image_url;

      if (aHasImage !== bHasImage) {
        return aHasImage ? -1 : 1;
      }

      const aUsed = a.status === 'used';
      const bUsed = b.status === 'used';
      if (aUsed !== bUsed) {
        return aUsed ? 1 : -1;
      }

      const aExpire = dayjs(a.expire_date);
      const bExpire = dayjs(b.expire_date);

      if (aExpire.isBefore(bExpire)) return -1;
      if (aExpire.isAfter(bExpire)) return 1;
      return 0;
    });

    const withImages = await attachDisplayImageUrls(sorted);

    setCoupons(withImages);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoupons();
    setRefreshing(false);
  };

  const today = dayjs().startOf('day');

  // ✅ 카운트 계산 (기존 유지)
  const activeCount = coupons.filter((c) => {
    const diff = dayjs(c.expire_date).diff(today, 'day');
    const notExpired = diff >= 0;
    return c.status !== 'used' && notExpired;
  }).length;

  const expiring7Count = coupons.filter((c) => {
    const diff = dayjs(c.expire_date).diff(today, 'day');
    const notExpired = diff >= 0;
    const within7 = diff <= 7;
    return c.status !== 'used' && notExpired && within7;
  }).length;

  const usedCount = coupons.filter((c) => c.status === 'used').length;

  const expiredCount = coupons.filter((c) => {
    const diff = dayjs(c.expire_date).diff(today, 'day');
    return c.status !== 'used' && diff < 0;
  }).length;

  const filteredCoupons = coupons.filter((c) => {
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
    const within7 = diff <= 7;

    switch (statusFilter) {
      case 'active':
        return c.status !== 'used' && notExpired;
      case 'expiring7':
        return c.status !== 'used' && notExpired && within7;
      case 'used':
        return c.status === 'used';
      case 'expired':
        return c.status !== 'used' && diff < 0;
      case 'all':
      default:
        return true;
    }
  });

  const renderEmpty = () => (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
      }}
    >
      <Ionicons name="leaf-outline" size={40} color={colors.subtext} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          fontFamily: 'PretendardBold',
          color: colors.text,
        }}
      >
        아직 저장된 도토리가 없어.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text
          style={{
            fontSize: 13,
            color: colors.subtext,
          }}
        >
          쿠폰이나 기프티콘을 하나씩 모아보자
        </Text>
        <DotoIcon size={16} style={{ marginLeft: 6 }} />
      </View>

      <DotoButton
        title="첫 도토리 기록하러 가기"
        onPress={() => navigation.navigate('AddCoupon')}
        style={{ marginTop: 20, paddingHorizontal: 16 }}
      />
    </View>
  );

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

  const renderItem = ({
    item,
    index,
  }: {
    item: Coupon;
    index: number;
  }) => {
    const { label, color, badgeBg, expireText } = getDdayInfo(
      item.expire_date,
      item.status
    );

    const inputRange = [
      -1,
      0,
      ROW_HEIGHT * index,
      ROW_HEIGHT * (index + 2),
    ];

    const scale = scrollY.interpolate({
      inputRange,
      outputRange: [1, 1, 1, 0.96],
    });

    const opacity = scrollY.interpolate({
      inputRange,
      outputRange: [1, 1, 1, 0.4],
    });

    return (
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity,
          marginHorizontal: 4,
          marginVertical: ITEM_SPACING,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() =>
            navigation.navigate('CouponDetail', { couponId: item.id })
          }
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
            {/* 이미지 영역 */}
            <View
              style={{
                width: 120,
                height: ITEM_HEIGHT,
                backgroundColor: '#E7DED2',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {(() => {
                const imageUri =
                  item.displayImageUrl ??
                  (item.image_url?.startsWith('http') ? item.image_url : null);
                if (!imageUri) {
                  return (
                    <>
                      <Ionicons name="image-outline" size={26} color={colors.subtext} />
                      <Text style={{ fontSize: 11, marginTop: 6, color: colors.subtext }}>
                        이미지 없음
                      </Text>
                    </>
                  );
                }
                return (
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                );
              })()}
            </View>

            {/* 내용 영역 */}
            <View
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 10,
                justifyContent: 'space-between',
              }}
            >
              <View>
                {/* 카테고리 & D-day */}
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
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: 'PretendardBold',
                        color: colors.text,
                      }}
                    >
                      {item.category || '기타'}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: badgeBg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: 'PretendardBold',
                        color,
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                </View>

                {/* 제목 */}
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 15,
                    fontFamily: 'PretendardBold',
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {item.title}
                </Text>

                {/* 메모 */}
                {item.memo ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      color: colors.subtext,
                    }}
                  >
                    {item.memo}
                  </Text>
                ) : (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      color: '#B3A89C',
                    }}
                  >
                    메모를 남겨두면 나중에 더 편해져.
                  </Text>
                )}
              </View>

              {/* 하단 만료일 텍스트 */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={colors.subtext}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.subtext,
                    }}
                  >
                    {expireText} 까지
                  </Text>
                </View>

                {item.status === 'used' && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.accent,
                    }}
                  >
                    사용 완료 ✅
                  </Text>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ✅ 통합 세그먼트(필터+숫자) — 기존 “숫자 현황판” 제거
  const renderStatusSegmentBar = () => {
    const segments: { key: StatusFilter; label: string; count: number }[] = [
      { key: 'all', label: '전체', count: coupons.length },
      { key: 'active', label: '사용 가능', count: activeCount },
      { key: 'expiring7', label: '7일 이내', count: expiring7Count },
      { key: 'used', label: '사용 완료', count: usedCount },
      { key: 'expired', label: '만료', count: expiredCount },
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
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: 'PretendardBold',
                    color: active ? colors.text : '#8F7E6C',
                  }}
                >
                  {seg.label}
                </Text>

                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    fontFamily: 'PretendardBold',
                    color: active ? colors.primary : '#8F7E6C',
                  }}
                >
                  {seg.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <View style={{ flex: 1, paddingTop: 8 }}>
        {/* 상단 헤더 + 추가 버튼 */}
        <View
          style={{
            paddingHorizontal: 4,
            marginBottom: 6,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: 'PretendardBold',
                  color: colors.text,
                }}
              >
                내 도토리
              </Text>
              <DotoIcon size={22} style={{ marginLeft: 6 }} />
            </View>
            <Text
              style={{
                marginTop: 4,
                fontSize: 12,
                color: colors.subtext,
              }}
            >
              지금 잊고 있는 게 없는지 한 번 훑어봐요.
            </Text>
          </View>

          <DotoButton
            title="추가"
            onPress={() => navigation.navigate('AddCoupon')}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
            }}
          />
        </View>

        {/* 검색 바 */}
        <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#F3E9DD',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={colors.subtext}
              style={{ marginRight: 6 }}
            />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="제목, 카테고리, 메모 검색"
              placeholderTextColor="#B7AFA5"
              style={{
                flex: 1,
                fontSize: 13,
                paddingVertical: 0,
                color: colors.text,
              }}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={16} color="#B2A89E" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ✅ 통합 필터(라벨+숫자) */}
        {renderStatusSegmentBar()}

        {/* 리스트 */}
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.subtext }}>불러오는 중...</Text>
          </View>
        ) : coupons.length === 0 ? (
          renderEmpty()
        ) : (
          <Animated.FlatList
            data={filteredCoupons}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 8,
              paddingBottom: 24,
              paddingTop: 4,
            }}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              searchText || statusFilter !== 'all' ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons
                    name="search-outline"
                    size={24}
                    color={colors.subtext}
                  />
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: colors.subtext,
                    }}
                  >
                    조건에 맞는 도토리가 없어요.
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
}
