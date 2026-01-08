// src/screens/AuthLandingScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Alert, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';

WebBrowser.maybeCompleteAuthSession();

// ✅ dev client/production 환경에 맞게 자동
const OAUTH_REDIRECT_TO = Linking.createURL('auth/callback');

const dotoringLogo = require('../assets/DOTORING.png');
const googleIcon = require('../assets/google-g.png');

/**
 * ✅ query(?a=b) + hash(#a=b) 모두 파싱
 * - PKCE: ?code=...
 * - Implicit: #access_token=...&refresh_token=...
 */
function parseParamsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const qIndex = url.indexOf('?');
    const hIndex = url.indexOf('#');

    const queryPart =
      qIndex >= 0 ? url.slice(qIndex + 1, hIndex >= 0 ? hIndex : undefined) : '';

    const hashPart = hIndex >= 0 ? url.slice(hIndex + 1) : '';

    const consume = (s: string) => {
      if (!s) return;
      for (const p of s.split('&')) {
        if (!p) continue;
        const [k, v] = p.split('=');
        if (!k) continue;
        const key = decodeURIComponent(k);
        const val = v ? decodeURIComponent(v) : '';
        out[key] = val;
      }
    };

    consume(queryPart);
    consume(hashPart);
  } catch {
    // ignore
  }
  return out;
}

export default function AuthLandingScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const lockRef = useRef(false);

  const [appleAvailable, setAppleAvailable] = useState<boolean>(Platform.OS === 'ios');
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS !== 'ios') return;
      try {
        const ok = await AppleAuthentication.isAvailableAsync();
        if (mounted) setAppleAvailable(ok);
      } catch {
        if (mounted) setAppleAvailable(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const commonBtnStyle = useMemo(
    () => ({
      height: 48,
      borderRadius: 12,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 14,
    }),
    []
  );

  const startStatus = (providerName: string) => {
    setStatusMsg(`${providerName}로 이동 중…\nDOTORING에서 접근합니다`);
  };
  const endStatus = () => setStatusMsg(null);

  /**
   * ✅ Google: Web OAuth (Browser session) 유지
   * - Apple은 네이티브로 별도 처리 (handleAppleNative)
   */
  const handleGoogleOAuth = async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setLoading(true);
      setLoadingProvider('google');
      startStatus('Google');

      console.log('[AuthLanding] OAUTH_REDIRECT_TO =', OAUTH_REDIRECT_TO);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: OAUTH_REDIRECT_TO,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('OAuth URL을 생성하지 못했어요.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_TO);
      console.log('[AuthLanding] openAuthSession result:', result.type, result.url);

      if (result.type !== 'success' || !result.url) return;

      const params = parseParamsFromUrl(result.url);

      // ✅ 에러가 전달되는 케이스도 처리
      if (params.error_description || params.error) {
        throw new Error(params.error_description || params.error);
      }

      // 1) ✅ PKCE 코드 플로우: code 있으면 교환
      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) throw exchangeError;
      }
      // 2) ✅ Implicit 플로우: access_token/refresh_token 있으면 세션 설정
      else if (params.access_token && params.refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (setSessionError) throw setSessionError;
      }
      // 3) 둘 다 없으면 실패
      else {
        throw new Error('로그인 결과에서 code 또는 access_token을 찾지 못했어요.');
      }

      // ✅ 세션 확인
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[AuthLanding] session after google login:', !!sessionData.session);
    } catch (e: any) {
      console.log('[AuthLanding] Google OAuth error:', e?.message ?? e);
      Alert.alert('Google 로그인 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
      setLoadingProvider(null);
      endStatus();
      lockRef.current = false;
    }
  };

  /**
   * ✅ Apple: 네이티브 로그인 → identityToken → Supabase signInWithIdToken
   * - WebBrowser/redirectTo/PKCE 교환 필요 없음
   */
  const handleAppleNative = async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setLoading(true);
      setLoadingProvider('apple');
      startStatus('Apple');

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identityToken from Apple');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[AuthLanding] session after apple login:', !!sessionData.session);
    } catch (e: any) {
      console.log('[AuthLanding] Apple native error:', e?.message ?? e);
      Alert.alert('Apple 로그인 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
      setLoadingProvider(null);
      endStatus();
      lockRef.current = false;
    }
  };

  return (
    <ScreenContainer>
      <View style={{ marginTop: 56, marginBottom: 18, alignItems: 'center' }}>
        <Image source={dotoringLogo} style={{ width: 64, height: 64, marginBottom: 10 }} resizeMode="contain" />
        <Text style={{ fontSize: 30, fontFamily: 'PretendardBold', color: colors.primary }}>DOTORING</Text>

        {statusMsg && (
          <View
            style={{
              marginTop: 10,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: '#111',
              maxWidth: 280,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 16 }}>{statusMsg}</Text>
          </View>
        )}

        <Text style={{ marginTop: 12, color: colors.subtext, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          잊어버리기 쉬운 작은 것들을{'\n'}도토링이 대신 기억해줄게요.
        </Text>
      </View>

      <SectionCard style={{ paddingTop: 18, paddingBottom: 18 }}>
        {/* Google */}
        <TouchableOpacity
          onPress={handleGoogleOAuth}
          disabled={loading}
          activeOpacity={0.9}
          style={{
            ...commonBtnStyle,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E0D8',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Image source={googleIcon} style={{ width: 18, height: 18 }} resizeMode="contain" />
          <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
            {loadingProvider === 'google' ? (
              <>
                <ActivityIndicator />
                <View style={{ width: 8 }} />
                <Text style={{ fontSize: 14, color: '#111', fontFamily: 'PretendardBold' }}>진행 중...</Text>
              </>
            ) : (
              <Text style={{ fontSize: 14, color: '#111', fontFamily: 'PretendardBold' }}>Google로 계속하기</Text>
            )}
          </View>
          <View style={{ width: 18 }} />
        </TouchableOpacity>

        {/* Apple (Native) */}
        {Platform.OS === 'ios' && appleAvailable && (
          <>
            <View style={{ height: 10 }} />
            <TouchableOpacity
              onPress={handleAppleNative}
              disabled={loading}
              activeOpacity={0.9}
              style={{
                ...commonBtnStyle,
                backgroundColor: '#111',
                borderWidth: 1,
                borderColor: '#111',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Text style={{ width: 18, color: '#fff', fontSize: 16, textAlign: 'center' }}></Text>
              <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                {loadingProvider === 'apple' ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <View style={{ width: 8 }} />
                    <Text style={{ fontSize: 14, color: '#fff', fontFamily: 'PretendardBold' }}>진행 중...</Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 14, color: '#fff', fontFamily: 'PretendardBold' }}>Apple로 계속하기</Text>
                )}
              </View>
              <View style={{ width: 18 }} />
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 12 }} />

        <DotoButton title="이메일로 계속하기" onPress={() => navigation.navigate('EmailAuth')} disabled={loading} />

        <View style={{ height: 10 }} />
        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          disabled={loading}
          activeOpacity={0.8}
          style={{ alignItems: 'center', paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 12, color: colors.subtext, textDecorationLine: 'underline' }}>
            비밀번호를 잊으셨나요?
          </Text>
        </TouchableOpacity>
      </SectionCard>

      <View style={{ marginTop: 18, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: colors.subtext, textAlign: 'center' }}>
          계속하면 개인정보 처리방침에 동의한 것으로 간주됩니다.
        </Text>
      </View>
    </ScreenContainer>
  );
}
