// src/utils/fetchCouponsPaged.ts
import { supabase } from '../api/supabaseClient';

const PAGE_SIZE = 20;

export type CouponRow = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: string;
  image_url?: string | null;
};

type Cursor = {
  expire_date: string;
  id: string;
} | null;

export async function fetchCouponsPaged(userId: string, cursor: Cursor) {
  let query = supabase
    .from('coupons')
    .select('id,title,category,memo,expire_date,status,image_url')
    .eq('user_id', userId)
    .order('expire_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query
      .or(
        `expire_date.gt.${cursor.expire_date},and(expire_date.eq.${cursor.expire_date},id.gt.${cursor.id})`
      );
  }

  const { data, error } = await query;
  if (error) throw error;

  const nextCursor =
    data && data.length === PAGE_SIZE
      ? { expire_date: data[data.length - 1].expire_date, id: data[data.length - 1].id }
      : null;

  return {
    items: data ?? [],
    nextCursor,
  };
}
