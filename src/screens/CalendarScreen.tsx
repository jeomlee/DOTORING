// src/screens/CalendarScreen.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import dayjs from 'dayjs';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import { getCategoryColor } from '../constants/categories';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: string;
};

export default function CalendarScreen({ navigation }: any) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    dayjs().format('YYYY-MM-DD')
  );

  const fetchCoupons = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', user.id);

    if (!error && data) {
      setCoupons(data as Coupon[]);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchCoupons);
    return unsub;
  }, [navigation, fetchCoupons]);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  // 캘린더에 표시할 마크 데이터
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    coupons.forEach((c) => {
      const key = c.expire_date;
      const isUsed = c.status === 'used';
      const isPast = dayjs(c.expire_date).isBefore(dayjs(), 'day');

      if (!marks[key]) {
        marks[key] = {
          marked: true,
          dots: [],
          selected: key === selectedDate,
          selectedColor: colors.primary,
        };
      }

      const dotColor = isUsed
        ? colors.accent
        : isPast
        ? '#C65B5B'
        : colors.primary;

      marks[key].dots = [
        ...(marks[key].dots || []),
        { color: dotColor, selectedDotColor: dotColor },
      ];

      // 선택 날짜 표시
      if (key === selectedDate) {
        marks[key].selected = true;
        marks[key].selectedColor = colors.primary;
      }
    });

    // ✅ 선택된 날짜에 쿠폰이 없어도, 선택 표시 유지
    if (!marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: colors.primary,
      };
    }

    // ✅ 오늘 날짜가 쿠폰이 없어도 "오늘 표기"가 보이도록 markedDates에 포함
    // - selectedDate가 오늘이면 이미 위에서 selected 처리됨
    // - 오늘이 selected가 아니면 "오늘"만 따로 표시(점은 없어도 됨)
    if (!marks[todayKey]) {
      marks[todayKey] = {
        ...(marks[todayKey] || {}),
        // calendar 기본 todayTextColor가 먹도록만 해도 충분하지만,
        // markedDates에 아예 키가 없으면 테마 적용이 미묘하게 안 먹는 케이스가 있어서
        // 오늘 키를 항상 넣어줌.
      };
    }

    return marks;
  }, [coupons, selectedDate, todayKey]);

  const couponsOfSelectedDate = useMemo(
    () => coupons.filter((c) => c.expire_date === selectedDate),
    [coupons, selectedDate]
  );

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const renderItem = ({ item }: { item: Coupon }) => {
    const diff = dayjs(item.expire_date).diff(dayjs(), 'day');
    const dday = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '만료됨';

    const statusColor =
      item.status === 'used'
        ? colors.accent
        : diff < 0
        ? '#C65B5B'
        : colors.primary;

    const categoryColor = getCategoryColor(item.category || undefined);

    return (
      <SectionCard style={{ marginBottom: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1, paddingRight: 8 }}>
            {!!item.category && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: categoryColor + '20',
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: 'PretendardBold',
                    color: categoryColor,
                  }}
                >
                  {item.category}
                </Text>
              </View>
            )}

            <Text
              style={{
                fontSize: 16,
                fontFamily: 'PretendardBold',
                color: colors.text,
              }}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            {item.memo ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.subtext,
                  marginTop: 4,
                }}
                numberOfLines={2}
              >
                {item.memo}
              </Text>
            ) : null}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'PretendardBold',
                color: statusColor,
              }}
            >
              {dday}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.subtext,
                marginTop: 4,
              }}
            >
              {item.status === 'used'
                ? '사용 완료 ✅'
                : diff < 0
                ? '만료됨 ❌'
                : '사용 가능 ✨'}
            </Text>
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

  return (
    <ScreenContainer>
      {/* 헤더 */}
      <View style={{ marginTop: 10, marginBottom: 12 }}>
        <Text
          style={{
            fontSize: 22,
            fontFamily: 'PretendardBold',
            color: colors.text,
          }}
        >
          달력으로 보는 도토리 📆
        </Text>
        <Text style={{ color: colors.subtext, marginTop: 4 }}>
          언제 어떤 도토리가 사라지는지 한눈에 확인해보세요.
        </Text>

        {/* ✅ 오늘 표시(가장 보편적이고 확실한 UX) */}
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
              marginRight: 6,
            }}
          />
          <Text style={{ fontSize: 12, color: colors.subtext }}>
            오늘: <Text style={{ fontFamily: 'PretendardBold', color: colors.text }}>{dayjs().format('YYYY.MM.DD')}</Text>
          </Text>
        </View>
      </View>

      {/* 캘린더 */}
      <SectionCard style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <Calendar
          onDayPress={onDayPress}
          markedDates={markedDates}
          markingType="multi-dot"
          // ✅ 달력에서도 오늘이 확실히 보이게: todayBackgroundColor + todayTextColor
          theme={{
            backgroundColor: colors.card,
            calendarBackground: colors.card,
            arrowColor: colors.primary,
            monthTextColor: colors.text,
            dayTextColor: colors.text,

            // ✅ 여기 2개가 핵심 (기능 안 사라지고 가장 표준적인 방식)
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
      <SectionCard style={{ marginBottom: 8 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: 'PretendardBold',
            color: colors.text,
            marginBottom: 4,
          }}
        >
          {dayjs(selectedDate).format('YYYY년 MM월 DD일')}의 도토리
        </Text>
        <Text style={{ fontSize: 12, color: colors.subtext }}>
          {couponsOfSelectedDate.length > 0
            ? `이 날에는 도토리가 ${couponsOfSelectedDate.length}개 있어요.`
            : '이 날에는 도토리가 없어요. 다른 날짜도 눌러보세요.'}
        </Text>
      </SectionCard>

      {/* 리스트 */}
      <FlatList
        data={couponsOfSelectedDate}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </ScreenContainer>
  );
}
