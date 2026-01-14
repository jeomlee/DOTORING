import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Platform } from 'react-native';
import { supabase } from '../api/supabaseClient';

type CouponRow = {
  id: string;
  title: string;
  expire_date: string; // 'YYYY-MM-DD'
  status?: string | null; // 'active' | 'used' | ...
};

type UserSettingsRow = {
  notif_enabled?: boolean | null;
  notify_lead_days?: number | null; // 1 | 3 | 7 | 10 | 30
};

const STORAGE_PREFIX = 'dotoring:notif:coupon:'; // + couponId + :lead / :d1
const DEFAULT_LEAD_DAYS = 1;
const ALLOWED_LEAD_DAYS = new Set([1, 3, 7, 10, 30]);

// ✅ 로컬 스케줄 상한 (너 설정 유지)
const MAX_SCHEDULED = 40;
const CANDIDATE_FETCH_LIMIT = 200;

// ✅ Android 채널 보장 (App.tsx 에서도 만들지만 “혹시 누락” 대비)
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch {}
}

// ✅ 권한 상태 확인
async function ensureNotifPermissionIfNeeded(): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === 'granted') return true;

    // 권한 요청은 SettingsScreen에서 스위치 ON 할 때만 하게 두는 게 안전.
    return false;
  } catch {
    return false;
  }
}

function keyLead(couponId: string) {
  return `${STORAGE_PREFIX}${couponId}:lead`;
}
function keyD1(couponId: string) {
  return `${STORAGE_PREFIX}${couponId}:d1`;
}

function buildTriggerDate(expireDate: string, daysBefore: number) {
  return dayjs(expireDate, 'YYYY-MM-DD')
    .subtract(daysBefore, 'day')
    .hour(9)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toDate();
}

function isCouponNotifiable(c: CouponRow) {
  if ((c.status ?? 'active') === 'used') return false;
  if (!c.expire_date) return false;

  // ✅ 만료일이 오늘 23:59:59 이전이면 제외
  const expire = dayjs(c.expire_date, 'YYYY-MM-DD').endOf('day');
  if (expire.isBefore(dayjs())) return false;

  return true;
}

async function getNotifSettings(): Promise<{ enabled: boolean; leadDays: number }> {
  let enabled = true;
  let leadDays = DEFAULT_LEAD_DAYS;

  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return { enabled, leadDays };

    const { data: s, error: sErr } = await supabase
      .from('user_settings')
      .select('notif_enabled, notify_lead_days')
      .eq('user_id', user.id)
      .maybeSingle<UserSettingsRow>();

    if (sErr) return { enabled, leadDays };

    if (typeof s?.notif_enabled === 'boolean') enabled = s.notif_enabled;

    const raw = s?.notify_lead_days ?? DEFAULT_LEAD_DAYS;
    leadDays = ALLOWED_LEAD_DAYS.has(raw) ? raw : DEFAULT_LEAD_DAYS;

    return { enabled, leadDays };
  } catch {
    return { enabled, leadDays };
  }
}

async function cancelByStorageKey(storageKey: string) {
  const id = await AsyncStorage.getItem(storageKey);
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
    await AsyncStorage.removeItem(storageKey);
  }
}

/**
 * ✅ 쿠폰 1개 알림 취소 (lead + d1 모두)
 */
export async function cancelCouponNotification(couponId: string) {
  await cancelByStorageKey(keyLead(couponId));
  await cancelByStorageKey(keyD1(couponId));
}

/**
 * ✅ 내부: 알림 1개 스케줄 (가장 안정적인 DATE 트리거)
 */
async function scheduleOne(coupon: CouponRow, kind: 'lead' | 'd1', daysBefore: number) {
  const triggerDate = buildTriggerDate(coupon.expire_date, daysBefore);

  // ✅ 트리거가 과거면 스킵
  if (dayjs(triggerDate).isBefore(dayjs())) {
    return { ok: true, skipped: true, reason: 'trigger_in_past' as const };
  }

  const title = '도토리 만료 알림 🔔';
  const body =
    kind === 'd1'
      ? `“${coupon.title}” 만료가 내일이에요. 오늘 꼭 써요!`
      : `“${coupon.title}” 만료가 ${daysBefore}일 남았어요. 잊지 말고 써요!`;

  // ✅ Android 채널 보장
  await ensureAndroidChannel();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: {
        couponId: coupon.id,
        expire_date: coupon.expire_date,
        kind,
        daysBefore,
      },
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return { ok: true, skipped: false, id, triggerDate };
}

/**
 * ✅ 쿠폰 1개 알림 스케줄
 * - 설정 leadDays 알림 1개 + D-1 알림 1개(무조건)
 * - leadDays가 1이면 lead와 d1이 겹치므로 d1만 유지
 */
export async function scheduleCouponNotification(coupon: CouponRow) {
  try {
    const { enabled, leadDays } = await getNotifSettings();

    if (!enabled) {
      await cancelCouponNotification(coupon.id);
      return { ok: true, skipped: true, reason: 'disabled' as const };
    }

    // ✅ OS 권한이 없으면 스케줄 자체를 하지 않음 (꼬임 방지)
    const permOk = await ensureNotifPermissionIfNeeded();
    if (!permOk) {
      await cancelCouponNotification(coupon.id);
      return { ok: true, skipped: true, reason: 'permission_off' as const };
    }

    if (!isCouponNotifiable(coupon)) {
      await cancelCouponNotification(coupon.id);
      return { ok: true, skipped: true, reason: 'notifiable_false' as const };
    }

    // 기존 모두 취소
    await cancelCouponNotification(coupon.id);

    // ✅ D-1 무조건
    const d1Res = await scheduleOne(coupon, 'd1', 1);
    if (!d1Res.skipped && (d1Res as any).id) {
      await AsyncStorage.setItem(keyD1(coupon.id), (d1Res as any).id);
    }

    // ✅ leadDays가 1이면 이미 D-1과 동일 → 중복 스킵
    if (leadDays !== 1) {
      const leadRes = await scheduleOne(coupon, 'lead', leadDays);
      if (!leadRes.skipped && (leadRes as any).id) {
        await AsyncStorage.setItem(keyLead(coupon.id), (leadRes as any).id);
      }
    }

    return { ok: true, skipped: false, leadDays };
  } catch (e: any) {
    console.log('[couponNotifications] scheduleCouponNotification error:', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'schedule_failed' };
  }
}

/**
 * ✅ 전체 재스케줄
 */
export async function rescheduleAllCouponNotifications() {
  try {
    const { enabled } = await getNotifSettings();

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;

    if (!userId) return { ok: false, error: 'no_user' };

    // ✅ 권한이 없으면 굳이 전체를 스케줄하지 말고 정리만
    const permOk = await ensureNotifPermissionIfNeeded();
    if (!permOk) {
      await cancelAllLocalCouponNotifications();
      return { ok: true, disabled: true, reason: 'permission_off' as const };
    }

    if (!enabled) {
      await cancelAllLocalCouponNotifications();
      return { ok: true, disabled: true, reason: 'disabled' as const };
    }

    const todayStr = dayjs().format('YYYY-MM-DD');

    const { data, error } = await supabase
      .from('coupons')
      .select('id, title, expire_date, status')
      .eq('user_id', userId)
      .neq('status', 'used')
      .gte('expire_date', todayStr)
      .order('expire_date', { ascending: true })
      .limit(CANDIDATE_FETCH_LIMIT);

    if (error) throw error;

    const candidates = ((data ?? []) as CouponRow[]).filter(isCouponNotifiable);

    // ✅ 기존 로컬 알림 싹 정리 후, 상위 N개만 스케줄
    await cancelAllLocalCouponNotifications();

    const toSchedule = candidates.slice(0, MAX_SCHEDULED);

    let scheduledCoupons = 0;
    for (const c of toSchedule) {
      // eslint-disable-next-line no-await-in-loop
      const res = await scheduleCouponNotification(c);
      if ((res as any)?.ok && !(res as any)?.skipped) scheduledCoupons += 1;
    }

    return { ok: true, scheduledCoupons, maxScheduled: MAX_SCHEDULED };
  } catch (e: any) {
    console.log('[couponNotifications] rescheduleAllCouponNotifications error:', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'reschedule_failed' };
  }
}

/**
 * ✅ 로컬 알림 전체 취소 (lead+d1 키 전부)
 */
export async function cancelAllLocalCouponNotifications() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const couponKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (couponKeys.length === 0) return { ok: true, removed: 0 };

    const pairs = await AsyncStorage.multiGet(couponKeys);

    for (const [, notifId] of pairs) {
      if (notifId) {
        try {
          await Notifications.cancelScheduledNotificationAsync(notifId);
        } catch {}
      }
    }

    await AsyncStorage.multiRemove(couponKeys);
    return { ok: true, removed: couponKeys.length };
  } catch (e: any) {
    console.log('[couponNotifications] cancelAllLocalCouponNotifications error:', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'cancel_all_failed' };
  }
}

/**
 * ✅ (추가) 로그아웃/세션 종료 시 "알림 0개 보장" 하드 리셋
 * - OS 레벨 스케줄 전체 취소 (앱이 예약한 모든 스케줄 알림)
 * - AsyncStorage에 저장된 쿠폰 알림 ID 키도 정리
 */
export async function hardResetAllScheduledNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  try {
    await cancelAllLocalCouponNotifications();
  } catch {}
}

/**
 * ✅ (추가) 디버그용: 지금 스케줄된 알림 개수/목록 확인
 * - 개발 중 확인용. 배포 시 지워도 됨.
 */
export async function debugGetScheduledNotifications() {
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    return { ok: true, count: list.length, list };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'debug_failed' };
  }
}
