import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';

import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'signup';

const REDIRECT_TO = 'dotoring://auth-callback';

function randomNonce(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordCheck, setPasswordCheck] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // ✅ Apple 버튼 표시 여부
  const [appleAvailable, setAppleAvailable] = useState(false);

  const lockRef = useRef(false);
  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS !== 'ios') {
        if (mounted) setAppleAvailable(false);
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (mounted) setAppleAvailable(available);
      } catch {
        if (mounted) setAppleAvailable(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleMode = (next: Mode) => {
    if (loading) return;
    setMode(next);
    setInfoMessage(null);
  };

  const validate = () => {
    if (!trimmedEmail || !password.trim()) {
      Alert.alert('알림', '이메일과 비밀번호를 모두 입력해줘.');
      return false;
    }
    if (mode === 'signup') {
      if (password.trim().length < 6) {
        Alert.alert('알림', '비밀번호는 6자 이상이어야 해.');
        return false;
      }
      if (password !== passwordCheck) {
        Alert.alert('알림', '비밀번호와 확인이 일치하지 않아.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (lockRef.current) return;
    if (!validate()) return;

    lockRef.current = true;
    setLoading(true);
    setInfoMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          const msg = (error.message || '').toLowerCase();

          if (msg.includes('email not confirmed')) {
            setInfoMessage('이메일이 아직 인증되지 않았어. 메일함을 확인해줘.');
            return;
          }

          if (msg.includes('invalid login credentials')) {
            Alert.alert('로그인 실패', '이메일/비밀번호를 확인해줘.');
            return;
          }

          Alert.alert('로그인 실패', error.message);
          return;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: REDIRECT_TO },
        });

        if (error) Alert.alert('회원가입 실패', error.message);
        else setInfoMessage('회원가입이 완료되었어. 이메일 인증 링크를 눌러줘.');
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '알 수 없는 오류가 발생했어.');
    } finally {
      setLoading(false);
      lockRef.current = false;
    }
  };

  const handleGoogle = async () => {
    if (lockRef.current) return;

    lockRef.current = true;
    setLoading(true);
    setInfoMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_TO,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('OAuth URL을 생성하지 못했어.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO);

      if (result.type !== 'success' || !result.url) return;

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (exchangeError) throw exchangeError;
    } catch (e: any) {
      Alert.alert('Google 로그인 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
      lockRef.current = false;
    }
  };

  const handleApple = async () => {
    if (Platform.OS !== 'ios') return;
    if (!appleAvailable) {
      Alert.alert('Apple 로그인', '이 기기/환경에서는 Apple 로그인을 사용할 수 없어.');
      return;
    }
    if (lockRef.current) return;

    lockRef.current = true;
    setLoading(true);
    setInfoMessage(null);

    try {
      const nonce = randomNonce(32);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple identityToken을 받지 못했어.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce,
      });

      if (error) throw error;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('cancel')) return;
      Alert.alert('Apple 로그인 실패', e?.message ?? msg);
    } finally {
      setLoading(false);
      lockRef.current = false;
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 상단 브랜드 */}
        <View style={{ marginTop: 32, marginBottom: 24, alignItems: 'center' }}>
          <Text allowFontScaling={false} style={{ fontSize: 26, fontFamily: 'PretendardBold', color: colors.primary }}>
            DOTORING
          </Text>
          <Text allowFontScaling={false} style={{ marginTop: 6, color: colors.subtext, fontSize: 13, textAlign: 'center' }}>
            잊어버리기 쉬운 작은 혜택들을{'\n'}
            도토링이 대신 기억해줄게.
          </Text>
        </View>

        {/* 로그인/회원가입 탭 */}
        <SectionCard style={{ flexDirection: 'row', padding: 4, borderRadius: 999, marginBottom: 18 }}>
          <TouchableOpacity
            onPress={() => toggleMode('login')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: mode === 'login' ? colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ color: mode === 'login' ? '#fff' : colors.text, fontFamily: 'PretendardBold', fontSize: 13 }}
            >
              로그인
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleMode('signup')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: mode === 'signup' ? colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ color: mode === 'signup' ? '#fff' : colors.text, fontFamily: 'PretendardBold', fontSize: 13 }}
            >
              회원가입
            </Text>
          </TouchableOpacity>
        </SectionCard>

        {/* 이메일 폼 */}
        <SectionCard style={{ paddingTop: 18, paddingBottom: 14 }}>
          <Text allowFontScaling={false} style={{ fontSize: 13, color: colors.subtext, marginBottom: 4 }}>
            이메일
          </Text>
          <TextInput
            allowFontScaling={false}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            placeholderTextColor="#C1B9B0"
            editable={!loading}
            style={{
              borderWidth: 1,
              borderColor: '#E0D8CF',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              marginBottom: 12,
              opacity: loading ? 0.9 : 1,
            }}
          />

          <Text allowFontScaling={false} style={{ fontSize: 13, color: colors.subtext, marginBottom: 4 }}>
            비밀번호
          </Text>
          <TextInput
            allowFontScaling={false}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="6자 이상 입력"
            placeholderTextColor="#C1B9B0"
            editable={!loading}
            style={{
              borderWidth: 1,
              borderColor: '#E0D8CF',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              marginBottom: mode === 'signup' ? 12 : 4,
              opacity: loading ? 0.9 : 1,
            }}
          />

          {mode === 'signup' && (
            <>
              <Text
                allowFontScaling={false}
                style={{ fontSize: 13, color: colors.subtext, marginBottom: 4, marginTop: 4 }}
              >
                비밀번호 확인
              </Text>
              <TextInput
                allowFontScaling={false}
                value={passwordCheck}
                onChangeText={setPasswordCheck}
                secureTextEntry
                placeholder="다시 한 번 입력해주세요"
                placeholderTextColor="#C1B9B0"
                editable={!loading}
                style={{
                  borderWidth: 1,
                  borderColor: '#E0D8CF',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 4,
                  opacity: loading ? 0.9 : 1,
                }}
              />
            </>
          )}

          {infoMessage && (
            <View style={{ marginTop: 8, marginBottom: 4 }}>
              <Text allowFontScaling={false} style={{ fontSize: 12, color: colors.accent }}>
                {infoMessage}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 16 }}>
            <DotoButton
              title={
                loading
                  ? mode === 'login'
                    ? '로그인 중...'
                    : '회원가입 중...'
                  : mode === 'login'
                  ? '로그인'
                  : '회원가입 완료'
              }
              onPress={handleSubmit}
              disabled={loading}
            />
          </View>
        </SectionCard>

        {/* 소셜 로그인 */}
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, opacity: 0.8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E0D8CF' }} />
            <Text allowFontScaling={false} style={{ marginHorizontal: 10, fontSize: 12, color: colors.subtext }}>
              또는
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E0D8CF' }} />
          </View>

          <SectionCard style={{ paddingTop: 14, paddingBottom: 14 }}>
            <DotoButton
              title={loading ? '진행 중...' : 'Google로 계속하기'}
              onPress={handleGoogle}
              disabled={loading}
              style={{ backgroundColor: '#111' }}
            />

            {/* ✅ Apple 공식 버튼 */}
            {Platform.OS === 'ios' && appleAvailable && (
              <View style={{ marginTop: 10 }}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={{ width: '100%', height: 46 }}
                  onPress={handleApple}
                />
              </View>
            )}
          </SectionCard>
        </View>

        {/* 하단 안내문 */}
        <View style={{ marginTop: 16, alignItems: 'center' }}>
          {mode === 'login' ? (
            <Text allowFontScaling={false} style={{ fontSize: 12, color: colors.subtext }}>
              아직 계정이 없다면, 위에서 회원가입을 선택해주세요.
            </Text>
          ) : (
            <Text allowFontScaling={false} style={{ fontSize: 12, color: colors.subtext }}>
              가입 후에는 이메일 인증 메일을 꼭 눌러주세요.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
