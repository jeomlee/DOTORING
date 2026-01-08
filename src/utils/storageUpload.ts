// src/utils/storageUpload.ts
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../api/supabaseClient';

const BUCKET = 'coupon-images';

/**
 * Expo/RN 안전 업로드
 * - local file uri(file://...) 를 base64로 읽어서 ArrayBuffer로 업로드
 * - 반환값: storage key (DB에는 이 key만 저장)
 */
export async function uploadCouponImageAsKey(params: {
  userId: string;
  localUri: string;     // ImagePicker 결과 uri
  couponId: string;     // DB row id (uuid)
}): Promise<string> {
  const { userId, localUri, couponId } = params;

  // ✅ 파일 존재 확인
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) throw new Error('이미지 파일을 찾을 수 없어.');

  // ✅ base64로 읽기
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const arrayBuffer = decode(base64);

  // ✅ 확장자/컨텐츠타입 추정
  const lower = localUri.toLowerCase();
  const ext = lower.includes('.png') ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // ✅ key 통일 (중요: 이 key 그대로 DB에 저장해야 Object not found 안 남)
  const key = `coupons/${userId}/${couponId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    // 여기서 Network request failed가 나면
    // 1) 정책 2) 버킷명 3) 네트워크(특히 iOS/시뮬레이터) 확인 필요
    throw new Error(error.message);
  }

  return key;
}
