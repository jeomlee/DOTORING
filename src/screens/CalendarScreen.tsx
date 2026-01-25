// src/screens/AuthScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  type TextProps,
  Linking,
  Keyboard,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../api/supabaseClient';
import ScreenContainer from '../components/ScreenContainer';

WebBrowser.maybeCompleteAuthSession();

/** ✅ 시스템 폰트 스케일 고정 */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

const COLORS = {
  BG: '#0B0F14',
  SURFACE: '#0E141C',
  LINE: '#1E2A38',
  TEXT: '#EAF2FF',
  MUTED: '#8FA3B8',

  BLUE: '#4CC9FF',
  BLUE_BG: 'rgba(76,201,255,0.14)',
  BLUE_LINE: 'rgba(76,201,255,0.35)',

  GREEN: '#3BE7B0',
  GREEN_BG: 'rgba(59,231,176,0.14)',
  GREEN_LINE: 'rgba(59,231,176,0.35)',

  GRAY_BG: 'rgba(107,127,150,0.12)',
  GRAY_LINE: 'rgba(107,127,150,0.28)',
};

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [emailOpen, setEmailOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  /**
   * ✅ Expo Go에서 구글 로그인 "무조건" 돌아오게 하는 redirectTo
   * - 아래 EXPO_USERNAME만 본인 것으로 맞춰라 (expo whoami)
   * - Supabase Auth > URL Configuration > Redirect URLs에 동일하게 추가
   */
  const EXPO_USERNAME = 'jeomlee'; // ← 반드시 본인 expo username
  const EXPO_SLUG = 'breath'; // app.json slug와 동일

  const redirectTo = useMemo(
    () => `https://auth.expo.io/@${EXPO_USERNAME}/${EXPO_SLUG}`,
    [EXPO_USERNAME, EXPO_SLUG]
  );

  const withLoading = async (fn: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ Android에서 "안 넘어감" 방지용:
   * 1) data.url 반드시 로그
   * 2) Linking.canOpenURL 체크
   * 3) 안되면 WebBrowser.openAuthSessionAsync로 fallback
   */
  const openOAuthUrl = async (url: string) => {
    console.log('OAUTH_URL =>', url);
    console.log('redirectTo =>', redirectTo);

    // 1) 일반 openURL 시도
    const can = await Linking.canOpenURL(url).catch(() => false);
    console.log('canOpenURL =>', can);

    if (can) {
      const ok = await Linking.openURL(url)
        .then(() => true)
        .catch((e) => {
          console.log('openURL failed =>', e?.message ?? e);
          return false;
        });

      if (ok) return;
    }

    // 2) fallback: WebBrowser auth session (상대적으로 안정적)
    try {
      const res = await WebBrowser.openAuthSessionAsync(url, redirectTo);
      console.log('openAuthSessionAsync =>', res);
      // res.type === 'success' 인 경우, res.url이 redirectTo로 돌아온 값
      if (res.type === 'success' && res.url) {
        // ✅ supabase v2: code를 세션으로 교환
        const { error } = await supabase.auth.exchangeCodeForSession(res.url);
        if (error) Alert.alert('세션 교환 실패', error.message);
      } else if (res.type === 'dismiss') {
        // 사용자가 닫음
      } else {
        // cancel / other
      }
    } catch (e: any) {
      console.log('openAuthSessionAsync failed =>', e?.message ?? e);
      Alert.alert('브라우저 열기 실패', e?.message ?? '브라우저를 열 수 없습니다.');
    }
  };

  const signInWithGoogle = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // ✅ RN에서는 우리가 브라우저를 여니까 true
          skipBrowserRedirect: true,
        },
      });

      if (error) return Alert.alert('로그인 실패', error.message);
      if (!data?.url) return Alert.alert('로그인 실패', '인증 URL이 비어 있습니다.');

      await openOAuthUrl(data.url);
    });
  };

  const signInWithApple = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      if (Platform.OS !== 'ios') return;

      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!cred.identityToken) {
        return Alert.alert('애플 로그인 실패', 'identityToken을 가져오지 못했습니다.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: cred.identityToken,
      });

      if (error) return Alert.alert('로그인 실패', error.message);
    });
  };

  const signInWithEmail = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      const e = email.trim();
      if (!isValidEmail(e)) return Alert.alert('확인 필요', '이메일 형식을 확인해 주세요.');
      if (password.length < 6) return Alert.alert('확인 필요', '비밀번호는 6자 이상이어야 합니다.');

      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) return Alert.alert('로그인 실패', error.message);
    });
  };

  const signUpWithEmail = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      const e = email.trim();
      if (!isValidEmail(e)) return Alert.alert('확인 필요', '이메일 형식을 확인해 주세요.');
      if (password.length < 6) return Alert.alert('확인 필요', '비밀번호는 6자 이상이어야 합니다.');

      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) return Alert.alert('가입 실패', error.message);

      Alert.alert('가입 완료', '메일함에서 인증을 완료한 뒤 로그인해 주세요.');
      setMode('login');
    });
  };

  const Btn = ({
    label,
    onPress,
    tone,
    icon,
  }: {
    label: string;
    onPress: () => void;
    tone: 'blue' | 'green' | 'neutral';
    icon: React.ReactNode;
  }) => {
    const bg =
      tone === 'blue' ? COLORS.BLUE_BG : tone === 'green' ? COLORS.GREEN_BG : COLORS.GRAY_BG;
    const border =
      tone === 'blue' ? COLORS.BLUE_LINE : tone === 'green' ? COLORS.GREEN_LINE : COLORS.GRAY_LINE;
    const text = tone === 'blue' ? COLORS.BLUE : tone === 'green' ? COLORS.GREEN : COLORS.TEXT;

    return (
      <Pressable
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => ({
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingVertical: 14,
          borderRadius: 18,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          opacity: loading ? 0.6 : pressed ? 0.88 : 1,
        })}
      >
        {icon}
        <T style={{ color: text, fontWeight: '900' }}>{label}</T>
      </Pressable>
    );
  };

  const Field = ({
    placeholder,
    value,
    onChangeText,
    secureTextEntry,
    keyboardType,
    autoCapitalize,
  }: {
    placeholder: string;
    value: string;
    onChangeText: (v: string) => void;
    secureTextEntry?: boolean;
    keyboardType?: any;
    autoCapitalize?: any;
  }) => {
    return (
      <View
        style={{
          width: '100%',
          borderWidth: 1,
          borderColor: COLORS.LINE,
          backgroundColor: COLORS.SURFACE,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#556477"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={{ color: COLORS.TEXT, fontWeight: '800' }}
        />
      </View>
    );
  };

  return (
    <ScreenContainer bg={COLORS.BG} barStyle="light-content">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 18,
            paddingVertical: 24,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 타이틀 */}
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.LINE,
                backgroundColor: COLORS.SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: COLORS.BLUE,
                  position: 'absolute',
                  top: 16,
                  left: 18,
                  opacity: 0.9,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: COLORS.GREEN,
                  position: 'absolute',
                  bottom: 14,
                  right: 16,
                  opacity: 0.9,
                }}
              />
              <Ionicons name="leaf-outline" size={22} color={COLORS.TEXT} />
            </View>

            <T style={{ color: COLORS.TEXT, fontSize: 28, fontWeight: '900', marginTop: 14 }}>
              BREATH
            </T>
            <T style={{ color: COLORS.MUTED, marginTop: 6 }}>멈춰도 괜찮은 꾸준함</T>

            <T
              style={{
                color: COLORS.MUTED,
                marginTop: 12,
                fontSize: 12,
                lineHeight: 18,
                textAlign: 'center',
              }}
            >
              오늘을 ‘완료’로 만들지 않아도 돼요.
              {'\n'}
              시작한 것만으로도 충분합니다.
            </T>
          </View>

          {/* 버튼 */}
          <View style={{ width: '100%', marginTop: 18, gap: 10 }}>
            <Btn
              label="Google로 계속"
              onPress={signInWithGoogle}
              tone="blue"
              icon={<Ionicons name="logo-google" size={18} color={COLORS.BLUE} />}
            />

            {Platform.OS === 'ios' ? (
              <Btn
                label="Apple로 계속"
                onPress={signInWithApple}
                tone="neutral"
                icon={<Ionicons name="logo-apple" size={20} color={COLORS.TEXT} />}
              />
            ) : null}

            {/* 이메일 토글 */}
            <Pressable
              onPress={() => setEmailOpen((v) => !v)}
              disabled={loading}
              style={({ pressed }) => ({
                width: '100%',
                paddingVertical: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.LINE,
                backgroundColor: COLORS.SURFACE,
                opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              })}
            >
              <Ionicons name="mail-outline" size={18} color={COLORS.GREEN} />
              <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>이메일로 계속</T>
              <Ionicons
                name={emailOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.MUTED}
                style={{ position: 'absolute', right: 14 }}
              />
            </Pressable>

            {emailOpen ? (
              <View style={{ width: '100%', gap: 10, marginTop: 6 }}>
                <Field
                  placeholder="이메일"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  placeholder="비밀번호 (6자 이상)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />

                {mode === 'login' ? (
                  <Btn
                    label="로그인"
                    onPress={signInWithEmail}
                    tone="green"
                    icon={<Ionicons name="log-in-outline" size={18} color={COLORS.GREEN} />}
                  />
                ) : (
                  <Btn
                    label="가입하기"
                    onPress={signUpWithEmail}
                    tone="green"
                    icon={<Ionicons name="person-add-outline" size={18} color={COLORS.GREEN} />}
                  />
                )}

                <Pressable
                  onPress={() => setMode((m) => (m === 'login' ? 'signup' : 'login'))}
                  disabled={loading}
                  style={({ pressed }) => ({
                    width: '100%',
                    paddingVertical: 12,
                    borderRadius: 18,
                    alignItems: 'center',
                    opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                  })}
                >
                  <T style={{ color: COLORS.MUTED, fontWeight: '900' }}>
                    {mode === 'login' ? '처음이신가요? 이메일로 가입하기' : '이미 계정이 있나요? 로그인으로'}
                  </T>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <ActivityIndicator />
                <T style={{ color: COLORS.MUTED, marginTop: 8, fontSize: 12 }}>잠시만요…</T>
              </View>
            ) : null}
          </View>

          {/* 하단 안내 */}
          <View style={{ marginTop: 14, width: '100%' }}>
            <T style={{ color: COLORS.MUTED, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
              계속 진행하면 서비스 이용약관 및 개인정보처리방침에 동의한 것으로 간주됩니다.
            </T>
            <T style={{ color: COLORS.MUTED, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
              (Dev) redirectTo: {redirectTo}
            </T>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
