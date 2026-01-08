import * as Notifications from 'expo-notifications';
import dayjs from 'dayjs';

/**
 * 쿠폰 만료일 기준으로 D-3, D-1, 당일 오전 9시에 알림 예약
 * expireDate: "YYYY-MM-DD" 형태 (DB에 저장하는 형식 그대로)
 */
export async function scheduleCouponNotifications(title: string, expireDate: string) {
  const now = dayjs();

  // 기준 시간: 오전 9시
  const targetBase = dayjs(expireDate + ' 09:00');

  const dates = [
    { offset: 3, label: 'D-3' },
    { offset: 1, label: 'D-1' },
    { offset: 0, label: '당일' },
  ];

  for (const { offset, label } of dates) {
    const triggerTime = targetBase.subtract(offset, 'day');

    if (triggerTime.isAfter(now)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `도토리 리마인드 (${label})`,
          body: `${title} 쿠폰 만료가 가까워졌어.`,
          data: { expireDate, title },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerTime.toDate(),
        },
      });
    }
  }
}
