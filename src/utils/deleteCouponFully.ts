// src/utils/deleteCouponFully.ts
import { supabase } from '../api/supabaseClient';
import { invalidateCouponImageUrl, normalizeStorageKey } from './imageUrls';
import { cancelCouponNotification } from './couponNotifications';

const BUCKET = 'coupon-images';

type Args = {
  couponId: string;
  image_url?: string | null;
};

/**
 * ✅ 완전 삭제(권장):
 * - (중요) 해당 쿠폰의 로컬 알림 먼저 취소
 * - DB 삭제를 우선(정합성)
 * - Storage 삭제는 병렬
 * - signed URL 캐시 무효화
 */
export async function deleteCouponFully({ couponId, image_url }: Args) {
  if (!couponId) throw new Error('couponId가 없습니다.');

  // ✅ 0) 로컬 알림 취소 (삭제한 쿠폰 알림이 나중에 울리는 문제 방지)
  try {
    await cancelCouponNotification(couponId);
  } catch {
    // 알림 취소 실패는 삭제를 막을 정도는 아님 (없을 수도 있음)
  }

  // ✅ 1) DB 삭제
  const dbPromise = supabase.from('coupons').delete().eq('id', couponId);

  // ✅ 2) Storage 삭제(있으면) + 캐시 무효화
  let storagePromise: Promise<any> | null = null;
  if (image_url) {
    try {
      invalidateCouponImageUrl(image_url);
    } catch {}

    const key = normalizeStorageKey(image_url);
    if (key) {
      storagePromise = supabase.storage.from(BUCKET).remove([key]);
    }
  }

  // ✅ 3) 병렬 실행
  const promises = storagePromise ? [dbPromise, storagePromise] : [dbPromise];
  const [dbRes] = await Promise.all(promises);

  if (dbRes?.error) {
    throw dbRes.error;
  }

  return true;
}
