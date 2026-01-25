// src/screens/CouponDetailScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Alert, ScrollView, Image, TouchableOpacity, Share } from 'react-native';
import dayjs from 'dayjs';
import ImageViewing from 'react-native-image-viewing';
import * as Sharing from 'expo-sharing';

// ✅ SDK54+ 경고 제거 (legacy API 사용)
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import DotoText from '../components/DotoText';
import { resolveCouponImageUrl } from '../utils/imageUrls';

// ✅ 알림 유틸 (leadDays/user_settings 반영)
import { scheduleCouponNotification, cancelCouponNotification } from '../utils/couponNotifications';

// ✅ DB + Storage + 알림까지 삭제
import { deleteCouponFully } from '../utils/deleteCouponFully';

type Coupon = {
  id: string;
  title: string;
  category?: string | null;
  memo?: string | null;
  expire_date: string; // 'YYYY-MM-DD'
  status: string; // 'active' | 'used' | ...
  image_url?: string | null;
  resolvedImageUrl?: string | null;
};

type Props = { route: any; navigation: any };

export default function CouponDetailScreen({ route, navigation }: Props) {
  const couponId: string | undefined = route?.params?.couponId;

  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [isImageViewerVisible, setImageViewerVisible] = useState(false);

  const fetchCoupon = useCallback(async () => {
    if (!couponId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from('coupons').select('*').eq('id', couponId).single();

    if (error || !data) {
      Alert.alert('오류', error?.message ?? '쿠폰을 불러오지 못했어요.');
      setLoading(false);
      return;
    }

    const typed = data as Coupon;

    let resolvedImageUrl: string | null = null;
    try {
      resolvedImageUrl = await resolveCouponImageUrl(typed.image_url);
    } catch (e: any) {
      console.log('[CouponDetail] resolve error:', e?.message ?? e);
      resolvedImageUrl = typed.image_url ?? null;
    }

    setCoupon({ ...typed, resolvedImageUrl });
    setLoading(false);
  }, [couponId]);

  useEffect(() => {
    fetchCoupon();
  }, [fetchCoupon]);

  if (!couponId) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <DotoText
            style={{
              fontSize: 16,
              fontFamily: 'PretendardBold',
              color: colors.text,
              marginBottom: 8,
            }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            쿠폰 정보를 불러올 수 없어요.
          </DotoText>
          <DotoText style={{ color: colors.subtext, marginBottom: 14, lineHeight: 20 }}>
            상세 화면으로 이동할 때 쿠폰 ID가 전달되지 않았어요. 홈으로 돌아가서 다시 열어주세요.
          </DotoText>
          <DotoButton title="뒤로가기" onPress={() => navigation.goBack()} />
        </View>
      </ScreenContainer>
    );
  }

  if (loading || !coupon) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <DotoText style={{ color: colors.subtext }} numberOfLines={1}>
            불러오는 중...
          </DotoText>
        </View>
      </ScreenContainer>
    );
  }

  const expire = dayjs(coupon.expire_date);
  const today = dayjs().startOf('day');
  const diff = expire.startOf('day').diff(today, 'day');
  const dday = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '만료됨';

  const statusColor = coupon.status === 'used' ? colors.accent : diff < 0 ? '#C65B5B' : colors.primary;

  const displayImageUri = coupon.resolvedImageUrl ?? coupon.image_url ?? null;

  const handleToggleStatus = async () => {
    const nextStatus = coupon.status === 'used' ? 'active' : 'used';

    setUpdating(true);
    const { error } = await supabase.from('coupons').update({ status: nextStatus }).eq('id', coupon.id);
    setUpdating(false);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    const updated: Coupon = { ...coupon, status: nextStatus };
    setCoupon(updated);

    try {
      if (nextStatus === 'used') {
        await cancelCouponNotification(updated.id);
      } else {
        await scheduleCouponNotification({
          id: updated.id,
          title: updated.title,
          expire_date: updated.expire_date,
          status: updated.status,
        });
      }
    } catch (e: any) {
      console.log('[CouponDetail] notif update error:', e?.message ?? e);
    }
  };

  const handleDelete = async () => {
    Alert.alert('정말 삭제할까요?', '이 도토리는 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setUpdating(true);

            await deleteCouponFully({
              couponId: coupon.id,
              image_url: coupon.image_url,
            });

            setUpdating(false);
            navigation.goBack();
          } catch (e: any) {
            setUpdating(false);
            console.log('[CouponDetail] delete error:', e);
            Alert.alert('삭제 실패', e?.message ?? '알 수 없는 오류');
          }
        },
      },
    ]);
  };

  const handleShare = async () => {
    try {
      setSharing(true);

      const title = coupon.title || '쿠폰';
      const expireText = expire.isValid() ? expire.format('YYYY년 MM월 DD일') : coupon.expire_date;

      const statusText =
        diff < 0 ? '❌ 상태: 만료됨' : coupon.status === 'used' ? '✅ 상태: 사용완료' : '✨ 상태: 사용가능';

      const message = [
        `🎟 ${title}`,
        coupon.category ? `📁 ${coupon.category}` : null,
        `🗓 만료일: ${expireText}`,
        statusText,
        coupon.memo ? `📝 ${coupon.memo}` : null,
        '',
        '— 도토링에서 공유했어',
      ]
        .filter(Boolean)
        .join('\n');

      const resolvedUri = coupon.resolvedImageUrl ?? coupon.image_url;
      if (!resolvedUri) {
        await Share.share({ message });
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        await Share.share({ message });
        return;
      }

      const lower = resolvedUri.toLowerCase();
      const ext = lower.includes('.png') ? 'png' : 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const uti = ext === 'png' ? 'public.png' : 'public.jpeg';

      const fileUri = `${FileSystem.cacheDirectory}coupon-${coupon.id}.${ext}`;

      const download = await FileSystem.downloadAsync(resolvedUri, fileUri);

      const info = await FileSystem.getInfoAsync(download.uri);
      if (!info.exists) throw new Error('이미지 파일을 저장하지 못했어요.');

      await Sharing.shareAsync(download.uri, {
        dialogTitle: '쿠폰 공유하기',
        mimeType,
        UTI: uti,
      });

      if (message) {
        await Share.share({ message });
      }
    } catch (e: any) {
      console.log('share error:', e);
      Alert.alert('공유 실패', e?.message ?? '알 수 없는 오류');
    } finally {
      setSharing(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ marginBottom: 16 }}>
          <DotoText style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={2} ellipsizeMode="tail">
            도토리 상세 보기 🔍
          </DotoText>
          <DotoText style={{ color: colors.subtext, marginTop: 4 }} numberOfLines={2} ellipsizeMode="tail">
            이미지를 중심으로, 잊지 말고 챙겨가요.
          </DotoText>
        </View>

        <SectionCard>
          {displayImageUri ? (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setImageViewerVisible(true)}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  marginBottom: 12,
                  backgroundColor: '#EEE',
                }}
              >
                <Image
                  source={{ uri: displayImageUri }}
                  style={{ width: '100%', height: 240 }}
                  resizeMode="cover"
                  onError={(e) => console.log('상세 이미지 로드 에러:', e.nativeEvent.error)}
                />
              </TouchableOpacity>

              <ImageViewing
                images={[{ uri: displayImageUri }]}
                imageIndex={0}
                visible={isImageViewerVisible}
                onRequestClose={() => setImageViewerVisible(false)}
              />
            </>
          ) : null}

          {coupon.category ? (
            <View
              style={{
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: '#F0E7DD',
                alignSelf: 'flex-start',
                marginBottom: 8,
              }}
            >
              <DotoText style={{ fontSize: 11, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {coupon.category}
              </DotoText>
            </View>
          ) : null}

          <DotoText
            style={{ fontSize: 18, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 6 }}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {coupon.title}
          </DotoText>

          {/* ✅ 2열 정보: 폰트/길이 때문에 밀리지 않게 flex 안정화 */}
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 2 }} numberOfLines={1}>
                만료일
              </DotoText>
              <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {expire.format('YYYY년 MM월 DD일')}
              </DotoText>
            </View>

            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 3 }} numberOfLines={1}>
                남은 기간
              </DotoText>
              <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: statusColor }} numberOfLines={1}>
                {dday}
              </DotoText>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 4 }} numberOfLines={1}>
              상태
            </DotoText>
            <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: statusColor }} numberOfLines={1} ellipsizeMode="tail">
              {coupon.status === 'used' ? '사용 완료 ✅' : diff < 0 ? '만료됨 ❌' : '사용 가능 ✨'}
            </DotoText>
          </View>

          {coupon.memo ? (
            <View style={{ marginTop: 14 }}>
              <DotoText style={{ fontSize: 12, color: colors.subtext, marginBottom: 4 }} numberOfLines={1}>
                메모
              </DotoText>
              <DotoText style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>
                {coupon.memo}
              </DotoText>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard>
          <DotoText style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 8 }} numberOfLines={1}>
            행동하기 🪵
          </DotoText>

          <DotoButton
            title={sharing ? '공유 준비 중...' : '📤 공유하기 (이미지)'}
            onPress={handleShare}
            disabled={sharing}
            style={{ backgroundColor: colors.accent, marginBottom: 10 }}
          />

          <DotoButton
            title={coupon.status === 'used' ? '다시 사용 가능으로 되돌리기' : '사용 완료로 표시하기'}
            onPress={handleToggleStatus}
            disabled={updating}
            style={{ marginBottom: 10 }}
          />

          <DotoButton
            title="도토리 삭제하기"
            onPress={handleDelete}
            disabled={updating}
            style={{ backgroundColor: '#C65B5B' }}
          />
        </SectionCard>
      </ScrollView>
    </ScreenContainer>
  );
}
