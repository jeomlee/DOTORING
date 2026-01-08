// src/utils/deleteCouponFully.ts
import { supabase } from '../api/supabaseClient';
import { invalidateCouponImageUrl, normalizeStorageKey } from './imageUrls';

const BUCKET = 'coupon-images';

type Args = {
  couponId: string;
  image_url?: string | null;
};

/**
 * ✅ 빠른 삭제:
 * - DB 삭제를 우선(정합성)
 * - Storage 삭제는 병렬
 * - signed URL 캐시 무효화
 */
export async function deleteCouponFully({ couponId, image_url }: Args) {
  if (!couponId) throw new Error('couponId가 없습니다.');

  const dbPromise = supabase.from('coupons').delete().eq('id', couponId);

  let storagePromise: Promise<any> | null = null;
  if (image_url) {
    invalidateCouponImageUrl(image_url);
    const key = normalizeStorageKey(image_url);
    if (key) {
      storagePromise = supabase.storage.from(BUCKET).remove([key]);
    }
  }

  const promises = storagePromise ? [dbPromise, storagePromise] : [dbPromise];
  const [dbRes] = await Promise.all(promises);

  if (dbRes?.error) {
    throw dbRes.error;
  }

  return true;
}
