// src/utils/imageHelpers.ts
import { supabase } from '../api/supabaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/**
 * 쿠폰 이미지를 Supabase Storage 에 업로드하고 public URL 을 반환
 * - bucket: coupon-images
 * - path: coupons/{userId_timestamp.ext}.jpg
 */
export async function uploadCouponImage(
  uri: string,
  userId: string
): Promise<string> {
  // 1) 이미지 리사이즈 & 압축 (너무 큰 파일 방지)
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  console.log('manipulated uri:', manipulated.uri);

  const fileName = `${userId}_${Date.now()}.jpg`;
  const filePath = `coupons/${fileName}`;
  const mimeType = 'image/jpeg';

  // 2) 파일을 base64 로 읽기
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    // 여기! EncodingType 쓰지 말고 그냥 문자열로
    encoding: 'base64' as any,
  });

  // 3) base64 → ArrayBuffer 로 변환
  const arrayBuffer = decode(base64);

  // 4) Supabase Storage 에 업로드
  const { data, error } = await supabase.storage
    .from('coupon-images')
    .upload(filePath, arrayBuffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    });

  if (error) {
    console.log('Supabase upload error:', error);
    throw new Error(error.message);
  }

  if (!data || !data.path) {
    throw new Error('업로드 경로를 가져오지 못했어.');
  }

  // 5) public URL 생성
  const { data: publicData } = supabase.storage
    .from('coupon-images')
    .getPublicUrl(data.path);

  if (!publicData || !publicData.publicUrl) {
    throw new Error('이미지 URL을 가져오지 못했어.');
  }

  console.log('업로드된 이미지 URL:', publicData.publicUrl);
  return publicData.publicUrl;
}
