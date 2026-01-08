// src/utils/storageImages.ts
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../api/supabaseClient';

/**
 * iOS에서 fetch(file://)가 실패하는 케이스가 많아서
 * FileSystem.readAsStringAsync(base64) -> ArrayBuffer 로 업로드한다.
 */

const BUCKET = 'coupon-images';

function base64ToArrayBuffer(base64: string) {
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function guessExt(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  return 'jpg';
}

function guessContentType(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * ✅ 업로드하고 "키"를 반환한다.
 * @returns key 예: coupons/<couponId>_1700000000000.jpg
 */
export async function uploadCouponImageAsKey(params: {
  couponId: string;
  localUri: string; // expo-image-picker uri (file://...)
}) {
  const { couponId, localUri } = params;

  try {
    const ext = guessExt(localUri);
    const key = `coupons/${couponId}_${Date.now()}.${ext}`;
    const contentType = guessContentType(ext);

    // ✅ iOS 안정: base64로 읽어서 ArrayBuffer로 변환
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const arrayBuffer = base64ToArrayBuffer(base64);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, arrayBuffer, {
        upsert: true,
        contentType,
      });

    if (error) throw error;

    return key;
  } catch (e: any) {
    console.log('[uploadCouponImageAsKey] error:', e?.message ?? e);
    throw e;
  }
}

export async function removeCouponImageByKey(key?: string | null) {
  if (!key) return;

  // key가 URL일 수도 있으니 key만 추출
  const k = extractStorageKey(key);
  if (!k) return;

  const { error } = await supabase.storage.from(BUCKET).remove([k]);
  if (error) throw error;
}

// key 추출 (URL or key)
export function extractStorageKey(input?: string | null): string | null {
  if (!input) return null;

  // 이미 키 형태면 그대로
  if (!input.startsWith('http')) return input;

  // URL에서 /object/public/<bucket>/ 이후를 키로 추출
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = input.indexOf(marker);
  if (idx >= 0) return input.substring(idx + marker.length);

  // signed URL(…/object/sign/<bucket>/<key>?token=) 대응
  const marker2 = `/storage/v1/object/sign/${BUCKET}/`;
  const idx2 = input.indexOf(marker2);
  if (idx2 >= 0) {
    const rest = input.substring(idx2 + marker2.length);
    return rest.split('?')[0] ?? null;
  }

  return null;
}
