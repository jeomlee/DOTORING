// src/utils/handleAuthCallback.ts
import { supabase } from '../api/supabaseClient';

function parseHashParams(url: string) {
  // 예: dotoring://auth-callback#access_token=...&refresh_token=...&type=signup
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};

  const hash = url.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);
  const out: Record<string, string> = {};
  params.forEach((v, k) => (out[k] = v));
  return out;
}

export async function handleAuthCallbackUrl(url: string) {
  try {
    // supabase가 보내는 형태가 "#access_token=..."라서 hash 파싱이 핵심
    const params = parseHashParams(url);

    const access_token = params['access_token'];
    const refresh_token = params['refresh_token'];

    if (!access_token || !refresh_token) return { ok: false, reason: 'no_tokens' as const };

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) return { ok: false, reason: 'set_session_failed' as const, error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false, reason: 'exception' as const, error: e };
  }
}
