import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';
import { getCategoryColor } from '../constants/categories';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: string;
};

const MAX_DOTS_PER_DAY = 3;

export default function CalendarScreen({ navigation }: any) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  const fetchCoupons = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase.from('coupons').select('*').eq('user_id', user.id);
    if (!error && data) setCoupons(data as Coupon[]);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchCoupons);
    return unsub;
  }, [navigation, fetchCoupons]);

  // ✅ dot 색 계산: 기본은 카테고리 색, 상태에 따라 덮어쓰기
  const getDotColor = useCallback((c: Coupon) => {
    const isPast = dayjs(c.expire_date).isBefore(dayjs(), 'day');
    if (c.status === 'used') return colors.accent; // 사용완료
    if (isPast) return '#C65B5B'; // 만료
    return getCategoryColor(c.category || undefined); // 활성: 카테고리 컬러
  }, []);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const c of coupons) {
      const key = c.expire_date;

      if (!marks[key]) {
        marks[key] = {
          marked: true,
          dots: [],
          selected: key === selectedDate,
          selectedColor: colors.primary,
        };
      }

      const dotColor = getDotColor(c);

      // ✅ dots 상한선
      const curDots = marks[key].dots || [];
      if (curDots.length < MAX_DOTS_PER_DAY) {
        marks[key].dots = [...curDots, { color: dotColor, selectedDotColor: dotColor }];
      }

      if (key === selectedDate) {
        marks[key].selected = true;
        marks[key].selectedColor = colors.primary;
      }
    }

    // ✅ 선택된 날짜 표시 유지 (쿠폰 없어도)
    if (!marks[selectedDate]) {
      marks[selectedDate] = { selected: true, selectedColor: colors.primary };
    }

    // ✅ 오늘 키도 항상 포함 (테마 todayTextColor/todayBackgroundColor 적용 안정화)
    if (!marks[todayKey]) {
      marks[todayKey] = { ...(marks[todayKey] || {}) };
    }

    return marks;
  }, [coupons, selectedDate, todayKey, getDotColor]);

  const couponsOfSelectedDate = useMemo(
    () => coupons.filter((c) => c.expire_date === selectedDate),
    [coupons, selectedDate]
  );

  const onDayPress = (day: DateData) => setSelectedDate(day.dateString);

  const renderItem = ({ item }: { item: Coupon }) => {
    const diff = dayjs(item.expire_date).diff(dayjs(), 'day');
    const dday = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '만료됨';

    const statusColor =
      item.status === 'used' ? colors.accent : diff < 0 ? '#C65B5B' : colors.primary;

    const categoryColor = getCategoryColor(item.category || undefined);

    return (
      <SectionCard style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            {!!item.category && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: categoryColor + '20',
                  marginBottom: 6,
                  alignSelf: 'flex-start',
                  minHeight: 20,
                  justifyContent: 'center',
                }}
              >
                <DotoText
                  style={{ fontSize: 10, fontFamily: 'PretendardBold', color: categoryColor }}
                  numberOfLines={1}
                >
                  {item.category}
                </DotoText>
              </View>
            )}

            <DotoText
              style={{ fontSize: 16, fontFamily: 'PretendardBold', color: colors.text }}
              numberOfLines={1}
            >
              {item.title}
            </DotoText>

            {item.memo ? (
              <DotoText style={{ fontSize: 12, color: colors.subtext, marginTop: 4 }} numberOfLines={2}>
                {item.memo}
              </DotoText>
            ) : null}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <DotoText
              style={{ fontSize: 14, fontFamily: 'PretendardBold', color: statusColor }}
              numberOfLines={1}
            >
              {dday}
            </DotoText>
            <DotoText style={{ fontSize: 12, color: colors.subtext, marginTop: 4 }} numberOfLines={1}>
              {item.status === 'used' ? '사용 완료 ✅' : diff < 0 ? '만료됨 ❌' : '사용 가능 ✨'}
            </DotoText>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <DotoButton
            title="상세 보기 🔍"
            onPress={() => navigation.navigate('CouponDetail', { couponId: item.id })}
          />
        </View>
      </SectionCard>
    );
  };

  // ✅ 리스트 헤더(스크롤에 포함됨)
  const ListHeader = useMemo(() => {
    return (
      <View>
        {/* 헤더 */}
        <View style={{ marginTop: 10, marginBottom: 12 }}>
          <DotoText style={{ fontSize: 22, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
            달력으로 보는 도토리 📆
          </DotoText>
          <DotoText style={{ color: colors.subtext, marginTop: 4 }} numberOfLines={2}>
            카테고리 색으로 점이 찍혀요. (만료=빨강, 사용완료=포인트색)
          </DotoText>

          {/* 오늘 표시 */}
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginRight: 6 }} />
            <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={1}>
              오늘:{' '}
              <DotoText style={{ fontFamily: 'PretendardBold', color: colors.text }}>
                {dayjs().format('YYYY.MM.DD')}
              </DotoText>
            </DotoText>
          </View>
        </View>

        {/* 캘린더 */}
        <SectionCard style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <Calendar
            onDayPress={onDayPress}
            markedDates={markedDates}
            markingType="multi-dot"
            theme={{
              backgroundColor: colors.card,
              calendarBackground: colors.card,
              arrowColor: colors.primary,
              monthTextColor: colors.text,
              dayTextColor: colors.text,
              todayTextColor: '#fff',
              todayBackgroundColor: colors.accent,
              textDisabledColor: '#CBC2B8',
              textDayFontFamily: 'Pretendard',
              textMonthFontFamily: 'PretendardBold',
              textDayHeaderFontFamily: 'Pretendard',
            }}
          />
        </SectionCard>

        {/* 선택된 날짜 요약 */}
        <SectionCard style={{ marginBottom: 10 }}>
          <DotoText
            style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 4 }}
            numberOfLines={1}
          >
            {dayjs(selectedDate).format('YYYY년 MM월 DD일')}의 도토리
          </DotoText>
          <DotoText style={{ fontSize: 12, color: colors.subtext }} numberOfLines={2}>
            {couponsOfSelectedDate.length > 0
              ? `이 날에는 도토리가 ${couponsOfSelectedDate.length}개 있어요.`
              : '이 날에는 도토리가 없어요. 아래에서 다른 날짜도 눌러보세요.'}
          </DotoText>
        </SectionCard>
      </View>
    );
  }, [markedDates, onDayPress, selectedDate, couponsOfSelectedDate.length, todayKey]);

  const Empty = useMemo(() => {
    return (
      <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 30 }}>
        <Ionicons name="calendar-outline" size={28} color={colors.subtext} />
        <DotoText style={{ marginTop: 10, color: colors.subtext }} numberOfLines={2}>
          선택한 날짜에 도토리가 없어.
        </DotoText>
      </View>
    );
  }, []);

  return (
    <ScreenContainer>
      {/* ✅ 전체를 FlatList 하나로: 달력도 스크롤 포함 */}
      <FlatList
        data={couponsOfSelectedDate}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={Empty}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews={true}
      />
    </ScreenContainer>
  );
}
