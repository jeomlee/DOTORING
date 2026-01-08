// src/utils/couponDelete.ts
import { supabase } from '../api/supabaseClient';
import { cancelCouponNotification } from './couponNotifications';

const BUCKET = 'coupon-images';

// image_url이 "경로"든 "URL"이든 storage remove에 넣을 "path"로 변환
function extractStoragePath(raw?: string | null): string | null {
  if (!raw) return null;

  // 이미 path로 저장된 경우 (예: coupons/xxx.jpg)
  if (!raw.startsWith('http')) return raw.replace(/^\/+/, '');

  // public url 형태
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) return raw.slice(idx + marker.length);

  // signed url 형태
  const marker2 = `/storage/v1/object/sign/${BUCKET}/`;
  const idx2 = raw.indexOf(marker2);
  if (idx2 >= 0) return raw.slice(idx2 + marker2.length).split('?')[0];

  return null;
}

export async function deleteCouponFully(couponId: string) {
  // 0) 알림부터 취소(안전)
  await cancelCouponNotification(couponId);

  // 1) 쿠폰 row에서 image_url 읽기
  const { data: row, error: readErr } = await supabase
    .from('coupons')
    .select('id,image_url')
    .eq('id', couponId)
    .maybeSingle();

  if (readErr) throw readErr;

  // 2) Storage 이미지 삭제(가능하면)
  const path = extractStoragePath(row?.image_url ?? null);
  if (path) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([path]);
    // 권한/정책 문제로 실패할 수 있어도 DB 삭제는 진행되게 처리
    if (sErr) console.log('[deleteCouponFully] storage remove error:', sErr.message);
  }

  // 3) DB row 삭제
  const { error: delErr } = await supabase.from('coupons').delete().eq('id', couponId);
  if (delErr) throw delErr;
}
