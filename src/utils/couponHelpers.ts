import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';

/**
 * 오늘 기준으로 이미 만료된 쿠폰들을 status = 'expired' 로 업데이트
 * - 사용 완료(used)는 건들지 않음
 */
export async function updateExpiredCoupons(userId: string) {
  const today = dayjs().format('YYYY-MM-DD');

  const { error } = await supabase
    .from('coupons')
    .update({ status: 'expired' })
    .lt('expire_date', today)
    .eq('user_id', userId)
    .neq('status', 'used');

  if (error) {
    console.warn('updateExpiredCoupons error', error.message);
  }
}
