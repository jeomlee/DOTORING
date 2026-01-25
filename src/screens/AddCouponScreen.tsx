// src/screens/AddCouponScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  TouchableOpacity,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';
import DotoTextInput from '../components/DotoTextInput';
import { scheduleCouponNotification } from '../utils/couponNotifications';

// ✅ 도토리 아이콘
import DOTORING_ICON from '../assets/DOTORING.png';

type CouponInsert = {
  user_id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string;
  status: 'active' | 'used';
  image_url?: string | null;
};

const CATEGORIES = ['쿠폰', '이벤트', '혜택', '일정', '기타'] as const;
const BUCKET = 'coupon-images';

function getImagePickerMediaTypes() {
  const anyPicker: any = ImagePicker as any;
  if (anyPicker.MediaType?.Images) return anyPicker.MediaType.Images;
  return anyPicker.MediaTypeOptions.Images;
}

/** sleep */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** timeout wrapper */
async function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}:${ms}ms`)), ms)),
  ]);
}

/** retry wrapper */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number; timeoutMs?: number; label?: string }
): Promise<T> {
  const retries = opts?.retries ?? 2; // 총 3회
  const baseDelayMs = opts?.baseDelayMs ?? 600;
  const timeoutMs = opts?.timeoutMs ?? 30000;
  const label = opts?.label ?? 'operation';

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (e: any) {
      lastErr = e;
      if (attempt === retries) break;

      const jitter = Math.floor(Math.random() * 250);
      const wait = baseDelayMs * Math.pow(2, attempt) + jitter;
      await sleep(wait);
    }
  }

  throw lastErr ?? new Error('unknown error');
}

/**
 * ✅ 업로드 성능/안정 개선 버전 (UI 영향 없음)
 */
async function uploadCouponImageAsKey(userId: string, localUri: string) {
  let sizeBytes: number | null = null;
  try {
    const info = await FileSystem.getInfoAsync(localUri, { size: true } as any);
    sizeBytes = typeof (info as any)?.size === 'number' ? (info as any).size : null;
  } catch {
    sizeBytes = null;
  }

  const policy =
    sizeBytes != null && sizeBytes >= 3 * 1024 * 1024
      ? { width: 780, compress: 0.72 }
      : sizeBytes != null && sizeBytes >= 1 * 1024 * 1024
      ? { width: 960, compress: 0.78 }
      : { width: 960, compress: 0.82 };

  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: policy.width } }],
    { compress: policy.compress, format: ImageManipulator.SaveFormat.JPEG }
  );

  const key = `coupons/${userId}/${Date.now()}.jpg`;

  const readArrayBuffer = async () => {
    const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: 'base64' as any,
    });

    const buf = Buffer.from(base64, 'base64');
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return arrayBuffer;
  };

  const doUpload = async () => {
    const arrayBuffer = await withRetry(readArrayBuffer, {
      retries: 1,
      baseDelayMs: 250,
      timeoutMs: 20000,
      label: 'read_base64',
    });

    const { error } = await supabase.storage.from(BUCKET).upload(key, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '86400',
    });

    if (error) throw error;
    return key;
  };

  return await withRetry(doUpload, {
    retries: 2,
    baseDelayMs: 700,
    timeoutMs: 35000,
    label: 'upload',
  });
}

export default function AddCouponScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('기타');

  const [expireDate, setExpireDate] = useState<Date>(dayjs().add(7, 'day').toDate());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mediaPermGrantedRef = useRef<boolean | null>(null);
  const savingLockRef = useRef(false);

  const expireText = useMemo(() => dayjs(expireDate).format('YYYY.MM.DD'), [expireDate]);

  useEffect(() => {
    navigation?.setOptions?.({ headerShown: false });
  }, [navigation]);

  const ensureMediaPermission = useCallback(async () => {
    if (mediaPermGrantedRef.current === true) return true;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    mediaPermGrantedRef.current = perm.granted;
    return perm.granted;
  }, []);

  const pickImage = useCallback(async () => {
    if (saving) return;
    try {
      const granted = await ensureMediaPermission();
      if (!granted) {
        Alert.alert('권한 필요', '앨범 접근 권한이 있어야 이미지를 선택할 수 있어요.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: getImagePickerMediaTypes(),
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setImageUri(asset.uri);
    } catch (e: any) {
      Alert.alert('오류', '이미지를 선택하지 못했어요.');
    }
  }, [ensureMediaPermission, saving]);

  const onChangeDate = useCallback((_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setExpireDate(selected);
  }, []);

  const handleSave = useCallback(async () => {
    if (savingLockRef.current) return;
    if (!title.trim()) {
      Alert.alert('입력 필요', '이름을 입력해주세요.');
      return;
    }

    savingLockRef.current = true;
    setSaving(true);

    try {
      await sleep(0);

      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user) throw new Error('로그인이 필요해요.');

      let imageKey: string | null = null;
      if (imageUri) {
        imageKey = await uploadCouponImageAsKey(user.id, imageUri);
      }

      const payload: CouponInsert = {
        user_id: user.id,
        title: title.trim(),
        category: category ?? '기타',
        memo: memo.trim() ? memo.trim() : null,
        expire_date: dayjs(expireDate).format('YYYY-MM-DD'),
        status: 'active',
        image_url: imageKey,
      };

      const { data, error } = await supabase.from('coupons').insert(payload).select('*').single();
      if (error) throw error;

      await scheduleCouponNotification({
        id: data.id,
        title: data.title,
        expire_date: data.expire_date,
        status: data.status,
      });

      navigation.navigate('MainTabs', {
        screen: 'Box',
        params: { newCoupon: data },
      });
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? '저장에 실패했어요.');
    } finally {
      setSaving(false);
      savingLockRef.current = false;
    }
  }, [title, memo, category, expireDate, imageUri, navigation]);

  const bottomSpace = useMemo(() => {
    return insets.bottom + (Platform.OS === 'android' ? 24 : 16);
  }, [insets.bottom]);

  return (
    <ScreenContainer includeBottomSafeArea>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomSpace }}
      >
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <DotoText style={{ fontSize: 22, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1}>
              도토리 추가
            </DotoText>
            <Image
              source={DOTORING_ICON}
              style={{ width: 22, height: 22, marginLeft: 6 }}
              resizeMode="contain"
            />
          </View>

          <DotoText style={{ marginTop: 4, color: colors.subtext }} numberOfLines={2} ellipsizeMode="tail">
            이미지를 중심으로 저장하면, 더 쉽게 꺼내 쓸 수 있어요.
          </DotoText>
        </View>

        <SectionCard style={{ marginBottom: 12 }}>
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 10 }} numberOfLines={1}>
            이미지 (선택)
          </DotoText>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={pickImage}
            style={{
              height: 220,
              borderRadius: 16,
              backgroundColor: '#E7DED2',
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="image-outline" size={28} color={colors.subtext} />
                <DotoText style={{ marginTop: 8, color: colors.subtext }} numberOfLines={1}>
                  이미지 선택하기
                </DotoText>
              </View>
            )}
          </TouchableOpacity>

          {imageUri ? (
            <View style={{ marginTop: 10 }}>
              <DotoButton
                title="이미지 다시 선택하기"
                onPress={pickImage}
                style={{ backgroundColor: '#B9A892' }}
                disabled={saving}
              />
            </View>
          ) : null}
        </SectionCard>

        <SectionCard style={{ marginBottom: 12 }}>
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 10 }} numberOfLines={1}>
            기본 정보 ✍️
          </DotoText>

          <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }} numberOfLines={1}>
            이름
          </DotoText>

          <DotoTextInput
            value={title}
            onChangeText={setTitle}
            placeholder="예) 스타벅스 아메리카노 T"
            placeholderTextColor="#B7AFA5"
            editable={!saving}
            returnKeyType="done"
            style={{
              borderWidth: 1,
              borderColor: '#E0D9CF',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'android' ? 10 : 12,
              fontFamily: 'Pretendard',
              color: colors.text,
              marginBottom: 12,
              backgroundColor: '#fff',
              opacity: saving ? 0.9 : 1,
              minHeight: 44, // ✅ 폰트/디스플레이 스케일에 흔들리지 않게
            }}
          />

          <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }} numberOfLines={1}>
            카테고리
          </DotoText>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => !saving && setCategory(c)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : '#E0D9CF',
                    backgroundColor: active ? '#F3E9DE' : '#fff',
                    marginRight: 8,
                    marginBottom: 8,
                    opacity: saving ? 0.85 : 1,
                    minHeight: 36, // ✅ 칩 높이 고정
                  }}
                >
                  <DotoText
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{
                      fontSize: 12,
                      fontFamily: active ? 'PretendardBold' : 'Pretendard',
                      color: active ? colors.primary : colors.text,
                    }}
                  >
                    {c}
                  </DotoText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 10 }} />

          <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }} numberOfLines={1}>
            메모 (선택)
          </DotoText>

          <DotoTextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="예) 매장 전용 / 사이즈 변경 불가"
            placeholderTextColor="#B7AFA5"
            multiline
            editable={!saving}
            textAlignVertical="top"
            style={{
              borderWidth: 1,
              borderColor: '#E0D9CF',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              minHeight: 90, // ✅ 기기 스케일에도 안정적으로
              fontFamily: 'Pretendard',
              color: colors.text,
              backgroundColor: '#fff',
              opacity: saving ? 0.9 : 1,
              lineHeight: 22, // ✅ 줄간격 고정(깨짐/겹침 방지)
            }}
          />
        </SectionCard>

        <SectionCard style={{ marginBottom: 12 }}>
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 10 }} numberOfLines={1}>
            만료일 📅
          </DotoText>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => !saving && setShowDatePicker(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderWidth: 1,
              borderColor: '#E0D9CF',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
              opacity: saving ? 0.9 : 1,
              minHeight: 48, // ✅ 버튼 높이 고정
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
              <Ionicons name="calendar-outline" size={18} color={colors.subtext} style={{ marginRight: 8 }} />
              <DotoText style={{ fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {expireText}
              </DotoText>
            </View>

            <DotoText style={{ color: colors.subtext }} numberOfLines={1}>
              변경
            </DotoText>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={expireDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeDate}
            />
          )}

          {Platform.OS === 'ios' && showDatePicker ? (
            <View style={{ marginTop: 10 }}>
              <DotoButton
                title="완료"
                onPress={() => setShowDatePicker(false)}
                style={{ backgroundColor: '#B9A892' }}
                disabled={saving}
              />
            </View>
          ) : null}
        </SectionCard>

        <View style={{ marginTop: 2 }}>
          <DotoButton
            title={saving ? '저장 중...' : '도토리 저장하기'}
            onPress={handleSave}
            disabled={saving}
          />
          <View style={{ height: 10 }} />
          <DotoButton
            title="취소"
            onPress={() => !saving && navigation.goBack()}
            style={{ backgroundColor: '#B9A892' }}
            variant="secondary"
            disabled={saving}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
