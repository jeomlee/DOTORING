// src/screens/SettingsScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Switch,
  Alert,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../api/supabaseClient';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import { colors } from '../theme';

import {
  rescheduleAllCouponNotifications,
  cancelAllLocalCouponNotifications, // ✅ 추가
} from '../utils/couponNotifications';

type ReasonKey =
  | 'too_hard'
  | 'not_useful'
  | 'buggy'
  | 'privacy'
  | 'switch_app'
  | 'other';

const REASONS: { key: ReasonKey; label: string }[] = [
  { key: 'too_hard', label: '사용이 어려워서' },
  { key: 'not_useful', label: '필요한 기능이 부족해서' },
  { key: 'buggy', label: '버그/불안정해서' },
  { key: 'privacy', label: '개인정보가 걱정돼서' },
  { key: 'switch_app', label: '다른 앱을 쓰게 돼서' },
  { key: 'other', label: '기타' },
];

// ✅ 알림 리드타임 옵션 (+10일 전 추가)
const LEAD_OPTIONS = [
  { days: 1, label: '하루 전' },
  { days: 3, label: '3일 전' },
  { days: 7, label: '7일 전' },
  { days: 10, label: '10일 전' },
  { days: 30, label: '한 달 전' },
] as const;

type LeadDays = (typeof LEAD_OPTIONS)[number]['days'];
const LEAD_DAYS_SET = new Set<number>(LEAD_OPTIONS.map((x) => x.days));

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 알림 설정값
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [leadDays, setLeadDays] = useState<LeadDays>(1);
  const [notifSaving, setNotifSaving] = useState(false);

  // ✅ 로그아웃 로딩
  const [logoutLoading, setLogoutLoading] = useState(false);

  // 삭제 모달
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<ReasonKey>('too_hard');
  const [reasonText, setReasonText] = useState('');
  const [password, setPassword] = useState('');

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [couponCount, setCouponCount] = useState<number>(0);
  const [imageCount, setImageCount] = useState<number>(0);

  const canProceedPassword = useMemo(() => password.trim().length >= 6, [password]);

  // ✅ user_settings 저장 helper
  const saveNotifSettings = async (
    patch: Partial<{ notif_enabled: boolean; notify_lead_days: number }>
  ) => {
    if (!userId) return;

    try {
      setNotifSaving(true);
      const { error } = await supabase.from('user_settings').upsert({
        user_id: userId,
        updated_at: new Date().toISOString(),
        ...patch,
      });
      if (error) throw error;
    } catch (e: any) {
      console.log('[user_settings] save error:', e?.message ?? e);
      Alert.alert('설정 저장 실패', e?.message ?? '설정을 저장하지 못했어요.');
    } finally {
      setNotifSaving(false);
    }
  };

  // ✅ 알림 권한 상태 검사 (출시용 필수)
  const ensureNotifPermissionIfEnabled = async (enabledFromDb: boolean) => {
    if (!enabledFromDb) return;

    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status === 'granted') return;

      // DB는 ON인데 OS는 OFF => UX 꼬임 방지: 앱에서 OFF로 내려준다
      setNotifEnabled(false);
      await saveNotifSettings({ notif_enabled: false });

      // 로컬 알림도 싹 정리
      await rescheduleAllCouponNotifications();

      Alert.alert(
        '알림 권한이 꺼져 있어요',
        '기기 설정에서 알림을 허용해야 만료 알림을 받을 수 있어요.\n(설정에서 다시 켤 수 있어요)'
      );
    } catch (e: any) {
      console.log('[ensureNotifPermissionIfEnabled] error:', e?.message ?? e);
    }
  };

  useEffect(() => {
    const loadUserAndNotifSettings = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        setEmail(data.user.email ?? null);
        setUserId(data.user.id);

        try {
          const { data: s, error: sErr } = await supabase
            .from('user_settings')
            .select('notif_enabled, notify_lead_days')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (sErr) {
            console.log('[user_settings] load error:', sErr.message);
            return;
          }

          if (!s) {
            // 없으면 생성 (기본값)
            const { error: upErr } = await supabase.from('user_settings').upsert({
              user_id: data.user.id,
              notif_enabled: true,
              notify_lead_days: 1,
              updated_at: new Date().toISOString(),
            });
            if (upErr) console.log('[user_settings] upsert error:', upErr.message);
            // 생성 후엔 기본값으로 유지
            return;
          }

          // notif_enabled
          const enabled = typeof s.notif_enabled === 'boolean' ? s.notif_enabled : true;
          setNotifEnabled(enabled);

          // leadDays (10 포함 안전 처리)
          const raw = s.notify_lead_days;
          if (typeof raw === 'number' && LEAD_DAYS_SET.has(raw)) {
            setLeadDays(raw as LeadDays);
          }

          // ✅ DB상 enabled=true면 OS 권한도 맞는지 확인 (꼬임 방지)
          await ensureNotifPermissionIfEnabled(enabled);
        } catch (e: any) {
          console.log('[user_settings] exception:', e?.message ?? e);
        }
      }
    };

    loadUserAndNotifSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // userId가 set된 이후 saveNotifSettings/permission 체크가 안정적으로 동작하도록

  const leadLabel = useMemo(() => {
    return LEAD_OPTIONS.find((x) => x.days === leadDays)?.label ?? '하루 전';
  }, [leadDays]);

  // ✅ 알림 스위치
  const toggleNotif = async (value: boolean) => {
    setNotifEnabled(value);

    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '알림 권한이 필요해요',
          '기기 설정에서 알림 권한을 켜줘야 만료 알림을 받을 수 있어요.'
        );
        setNotifEnabled(false);
        await saveNotifSettings({ notif_enabled: false });
        return;
      }
    }

    await saveNotifSettings({ notif_enabled: value });

    // ✅ ON/OFF 반영해서 전체 재예약 (OFF면 로컬 스케줄 싹 정리됨)
    await rescheduleAllCouponNotifications();
  };

  // ✅ 리드타임 선택 + 즉시 전체 재예약
  const selectLeadDays = async (days: LeadDays) => {
    setLeadDays(days);
    await saveNotifSettings({ notify_lead_days: days });
    await rescheduleAllCouponNotifications();
  };

  /**
   * ✅ 알림 테스트
   */
  const handleTestNotif = async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;

      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }

      if (status !== 'granted') {
        Alert.alert(
          '알림 권한이 꺼져 있어요',
          '기기 설정에서 도토링 알림 권한을 켜줘야 테스트 알림도 받을 수 있어요.'
        );
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          enableVibrate: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      const date = new Date(Date.now() + 5000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '도토링 알림 테스트 🔔',
          body: `설정대로라면 “${leadLabel}”에 이렇게 알려줄게요.`,
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });

      Alert.alert('테스트 예약 완료', '5초 뒤에 알림이 떠야 정상이에요.');
    } catch (e: any) {
      console.log('[handleTestNotif] error:', e?.message ?? e);
      Alert.alert('오류', e?.message ?? '알림을 보낼 수 없었어요.');
    }
  };

  // ✅ 로그아웃: "로컬 스케줄" 먼저 정리하고 signOut
  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      // ✅ 핵심: 디바이스에 남아있는 예약 알림을 싹 제거
      await cancelAllLocalCouponNotifications();

      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert('로그아웃 실패', error.message);
    } finally {
      setLogoutLoading(false);
    }
  };

  const loadDeleteSummary = async () => {
    try {
      setSummaryLoading(true);

      let q = supabase.from('coupons').select('*', { count: 'exact', head: true });
      if (userId) q = q.eq('user_id', userId);

      const { count, error: countErr } = await q;
      if (countErr) throw countErr;
      setCouponCount(count ?? 0);

      let total = 0;
      if (userId) {
        const { data: list, error: listErr } = await supabase.storage
          .from('coupon-images')
          .list(`coupons/${userId}`, { limit: 1000 });

        if (!listErr && list) total += list.filter((x) => !!x.name).length;
      }
      setImageCount(total);
    } catch (e: any) {
      console.log('loadDeleteSummary error:', e?.message ?? e);
      setCouponCount(0);
      setImageCount(0);
    } finally {
      setSummaryLoading(false);
    }
  };

  const openDeleteFlow = async () => {
    setReason('too_hard');
    setReasonText('');
    setPassword('');
    setDeleteStep(1);
    setDeleteOpen(true);
    await loadDeleteSummary();
  };

  const closeDeleteFlow = () => {
    if (deleteStep === 3) return;
    setDeleteOpen(false);
  };

  const reauthWithPassword = async () => {
    if (!email) throw new Error('이메일을 불러오지 못했어요.');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    });
    if (error) throw error;
  };

  const requestDeleteAccount = async () => {
    try {
      setDeleteStep(3);

      await reauthWithPassword();

      const payload = {
        reason,
        reasonText: reason === 'other' ? reasonText.trim() : '',
        summary: { couponCount, imageCount },
      };

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: payload,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? '삭제에 실패했어요.');

      Alert.alert('탈퇴 완료', '계정이 삭제되었어요. 이용해줘서 고마워요.');

      // ✅ 혹시 탈퇴 후에도 남는 로컬 알림 제거
      await cancelAllLocalCouponNotifications();

      await supabase.auth.signOut();
      setDeleteOpen(false);
    } catch (e: any) {
      console.log('delete-account error:', e);
      Alert.alert(
        '계정 삭제 실패',
        e?.message ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해줘요.'
      );
      setDeleteStep(2);
    }
  };

  const reasonLabel = useMemo(() => REASONS.find((r) => r.key === reason)?.label ?? '', [reason]);

  // ✅ iOS에서 탭바+홈인디케이터에 가려지지 않도록
  const contentBottomPadding = 24 + insets.bottom + 72;

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        {/* 헤더 */}
        <View style={{ marginTop: 10, marginBottom: 18 }}>
          <Text style={{ fontSize: 22, fontFamily: 'PretendardBold', color: colors.text }}>
            설정 ⚙️
          </Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>
            도토리를 더 편하게 챙길 수 있도록, 환경을 조금 손봐볼까요.
          </Text>
        </View>

        {/* 계정 */}
        <SectionCard style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 16,
              fontFamily: 'PretendardBold',
              color: colors.text,
              marginBottom: 8,
            }}
          >
            계정 👤
          </Text>

          <Text style={{ fontSize: 13, color: colors.subtext }}>로그인 이메일</Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 14,
              color: colors.text,
              fontFamily: 'PretendardBold',
            }}
          >
            {email ?? '알 수 없음'}
          </Text>

          <View style={{ marginTop: 14 }}>
            <DotoButton
              title={logoutLoading ? '로그아웃 중...' : '로그아웃 하기'}
              onPress={handleLogout}
              disabled={logoutLoading}
              style={{ backgroundColor: '#C65B5B' }}
            />
          </View>
        </SectionCard>

        {/* 알림 */}
        <SectionCard style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 16,
              fontFamily: 'PretendardBold',
              color: colors.text,
              marginBottom: 12,
            }}
          >
            알림 🔔
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 14, fontFamily: 'PretendardBold', color: colors.text }}>
                만료 알림 받기
              </Text>
              <Text style={{ fontSize: 12, color: colors.subtext, marginTop: 4 }}>
                도토리가 사라지기 전에{' '}
                <Text style={{ fontFamily: 'PretendardBold' }}>{leadLabel}</Text>에 알려줄게요.
              </Text>
            </View>

            <Switch
              value={notifEnabled}
              onValueChange={toggleNotif}
              thumbColor={notifEnabled ? colors.primary : '#fff'}
              trackColor={{ false: '#D6CEC5', true: '#D6B89A' }}
            />
          </View>

          {/* 리드타임 */}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }}>알림 시점 선택</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {LEAD_OPTIONS.map((opt) => {
                const active = opt.days === leadDays;

                return (
                  <Pressable
                    key={opt.days}
                    onPress={() => selectLeadDays(opt.days)}
                    disabled={!notifEnabled || notifSaving}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : '#E0D9CF',
                      backgroundColor: active ? '#F3E9DE' : '#fff',
                      marginRight: 8,
                      marginBottom: 8,
                      opacity: !notifEnabled ? 0.45 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: active ? colors.primary : colors.text,
                        fontFamily: active ? 'PretendardBold' : 'Pretendard',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ fontSize: 12, color: colors.subtext, marginTop: 2 }}>
              * 알림은 오전 9시 기준으로 보내요.
            </Text>
          </View>

          <View style={{ marginTop: 14 }}>
            <DotoButton
              title={notifSaving ? '저장 중...' : '알림 테스트 보내보기'}
              onPress={handleTestNotif}
              disabled={notifSaving}
              style={{ backgroundColor: colors.accent }}
            />
          </View>
        </SectionCard>

        {/* 기타 */}
        <SectionCard>
          <Text style={{ fontSize: 16, fontFamily: 'PretendardBold', color: colors.text, marginBottom: 8 }}>
            기타 🌿
          </Text>

          <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 12 }}>
            도토링은 지금 작은 실험 단계예요. 사용해보면서 느낀 점이 있다면,
            문의하기를 통해 알려주세요.
          </Text>

          <DotoButton
            title="개인정보 처리방침 보기"
            onPress={() => navigation.navigate('PrivacyPolicy')}
            style={{ backgroundColor: '#B9A892' }}
          />
          <View style={{ height: 8 }} />
          <DotoButton
            title="문의하기"
            onPress={() => navigation.navigate('Contact')}
            style={{ backgroundColor: '#B9A892' }}
          />

          <View style={{ height: 12 }} />
          <DotoButton
            title="계정 삭제 (데이터 포함)"
            onPress={openDeleteFlow}
            style={{ backgroundColor: '#2D2D2D' }}
          />
          <Text style={{ marginTop: 10, fontSize: 12, color: colors.subtext }}>
            * 삭제하면 쿠폰 데이터/이미지가 모두 삭제되고 복구할 수 없어요.
          </Text>
        </SectionCard>
      </ScrollView>

      {/* 계정삭제 모달 (너 코드 그대로 유지) */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={closeDeleteFlow}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 16,
              backgroundColor: '#fff',
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontFamily: 'PretendardBold', color: colors.text }}>
                계정 삭제
              </Text>

              <Pressable onPress={closeDeleteFlow} disabled={deleteStep === 3}>
                <Text style={{ color: colors.subtext, fontSize: 13 }}>닫기</Text>
              </Pressable>
            </View>

            <View style={{ height: 10 }} />

            {deleteStep === 1 && (
              <>
                <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 10 }}>
                  삭제하면 쿠폰/이미지 포함 모든 데이터가 삭제되고 복구할 수 없어요.
                </Text>

                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E0D9CF',
                  }}
                >
                  <Text style={{ fontFamily: 'PretendardBold', color: colors.text, marginBottom: 6 }}>
                    삭제 요약
                  </Text>

                  {summaryLoading ? (
                    <View style={{ paddingVertical: 8 }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : (
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>
                      쿠폰 {couponCount}개 · 이미지 {imageCount}개
                      {imageCount === 0 ? '\n(이미지 폴더 구조에 따라 0으로 보일 수 있어요)' : ''}
                    </Text>
                  )}
                </View>

                <View style={{ height: 12 }} />

                <Text style={{ fontFamily: 'PretendardBold', color: colors.text, marginBottom: 8 }}>
                  탈퇴 이유 (선택)
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REASONS.map((r) => {
                    const active = r.key === reason;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setReason(r.key)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? colors.primary : '#E0D9CF',
                          backgroundColor: active ? '#F3E9DE' : '#fff',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: active ? colors.primary : colors.text,
                            fontFamily: active ? 'PretendardBold' : 'Pretendard',
                          }}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {reason === 'other' && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }}>
                      기타 사유 (선택)
                    </Text>
                    <TextInput
                      value={reasonText}
                      onChangeText={setReasonText}
                      placeholder="짧게 적어줘도 좋아요."
                      placeholderTextColor="#9E9E9E"
                      style={{
                        borderWidth: 1,
                        borderColor: '#E0D9CF',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: Platform.OS === 'android' ? 10 : 12,
                        fontFamily: 'Pretendard',
                        color: colors.text,
                      }}
                    />
                  </View>
                )}

                <View style={{ height: 14 }} />

                <DotoButton
                  title="다음 (비밀번호 확인)"
                  onPress={() => setDeleteStep(2)}
                  style={{ backgroundColor: colors.primary }}
                />
              </>
            )}

            {deleteStep === 2 && (
              <>
                <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 12 }}>
                  안전을 위해 비밀번호를 다시 확인할게요.
                </Text>

                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }}>이메일</Text>
                  <Text style={{ fontFamily: 'PretendardBold', color: colors.text }}>
                    {email ?? '-'}
                  </Text>
                </View>

                <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 6 }}>비밀번호</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="비밀번호 입력"
                  placeholderTextColor="#9E9E9E"
                  secureTextEntry
                  style={{
                    borderWidth: 1,
                    borderColor: '#E0D9CF',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: Platform.OS === 'android' ? 10 : 12,
                    fontFamily: 'Pretendard',
                    color: colors.text,
                  }}
                />

                <View style={{ height: 14 }} />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <DotoButton
                      title="이전"
                      onPress={() => setDeleteStep(1)}
                      style={{ backgroundColor: '#B9A892' }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DotoButton
                      title="삭제 진행"
                      onPress={requestDeleteAccount}
                      disabled={!canProceedPassword}
                      style={{ backgroundColor: '#2D2D2D' }}
                    />
                  </View>
                </View>

                <Text style={{ marginTop: 10, fontSize: 12, color: colors.subtext }}>
                  선택한 이유: {reasonLabel}
                </Text>
              </>
            )}

            {deleteStep === 3 && (
              <>
                <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 12 }}>
                  삭제 요청을 처리 중이에요… 잠시만요.
                </Text>
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
