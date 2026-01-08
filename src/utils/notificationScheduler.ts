import * as Notifications from 'expo-notifications';
import dayjs from 'dayjs';

type CouponLike = {
  id: string;
  title: string;
  expire_date: string; // YYYY-MM-DD
  status: string; // 'active' | 'used' ...
};

export async function cancelCouponNotification(couponId: string) {
  // 알림 id를 couponId 기반으로 만들면 추적이 쉬움
  const identifier = `coupon-expire-${couponId}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // 없는 알림 취소는 무시
  }
}

export async function scheduleCouponNotification(params: {
  coupon: CouponLike;
  leadDays: number; // 1/3/7/30
  enabled: boolean;
}) {
  const { coupon, leadDays, enabled } = params;

  // 사용완료는 알림 필요 없음
  if (!enabled) return;
  if (coupon.status === 'used') return;

  const expire = dayjs(coupon.expire_date).startOf('day');
  const triggerTime = expire.subtract(leadDays, 'day').hour(9).minute(0).second(0);

  // 이미 지난 시각이면 스케줄하지 않음
  if (triggerTime.isBefore(dayjs())) return;

  // 기존 알림 제거 후 다시 등록(중복 방지)
  await cancelCouponNotification(coupon.id);

  await Notifications.scheduleNotificationAsync({
    identifier: `coupon-expire-${coupon.id}`,
    content: {
      title: `만료 ${leadDays}일 전 🔔`,
      body: `“${coupon.title}” 도토리가 곧 사라져요. 잊기 전에 써버리자!`,
      data: { couponId: coupon.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerTime.toDate(),
    },
  });
}
