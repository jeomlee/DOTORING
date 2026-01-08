import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ksaeagcbsuzkdtdlbxlp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ECqyi5URkvyOBUI02FrhMA_SHF8Givy';

// ---- 안정화 fetch (timeout + retry) ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableNetworkError(err: any) {
  const msg = (err?.message ?? String(err ?? '')).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('request failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 25000) {
  // AbortController는 RN(Expo)에서 대부분 지원됨
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  // 업로드는 길어질 수 있어서 메서드/URL에 따라 타임아웃을 조금 다르게
  const url = typeof input === 'string' ? input : input?.toString?.() ?? '';
  const method = (init?.method ?? 'GET').toUpperCase();

  const isUpload =
    method === 'POST' &&
    (url.includes('/storage/v1/object') || url.includes('/storage/v1/upload'));

  const timeoutMs = isUpload ? 45000 : 25000;
  const retries = isUpload ? 2 : 1;

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, timeoutMs);

      // 5xx는 재시도 가치 있음
      if (res.status >= 500 && attempt < retries) {
        await sleep(400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
        continue;
      }

      return res;
    } catch (e: any) {
      lastErr = e;
      if (!isRetryableNetworkError(e) || attempt === retries) throw e;
      await sleep(400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
    }
  }

  throw lastErr;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: supabaseFetch,
  },
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
