// src/screens/AuthLandingScreen.tsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, Alert, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';

const dotoringLogo = require('../assets/DOTORING.png');
const googleIcon = require('../assets/google-g.png');

export default function AuthLandingScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const lockRef = useRef(false);

  const [appleAvailable, setAppleAvailable] = useState<boolean>(Platform.OS === 'ios');

  // ✅ Google 네이티브 설정 (Android 안정형)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId) {
      console.log('[AuthLanding] Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
      // 앱 크래시 방지: 런타임에서만 경고
      Alert.alert(
        '설정 필요',
        'Google 로그인 설정(Web Client ID)이 누락되었습니다.\n.env에 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID를 설정해주세요.'
      );
      return;
    }

    GoogleSignin.configure({
      webClientId,
      // ✅ 기본 스코프 (이메일/프로필)
      scopes: ['email', 'profile'],
      // offlineAccess는 보통 필요없음 (서버에서 refresh token까지 다룰 때만)
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
  }, []);

  // ✅ Apple 가용성 체크 (iOS)
  useEffect(() => {
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
    setStatusMsg(`${providerName}로 진행 중…\nDOTORING에서 안전하게 로그인합니다`);
  };
  const endStatus = () => setStatusMsg(null);

  /**
   * ✅ Google: 네이티브 로그인 → idToken → Supabase signInWithIdToken
   * - 브라우저를 열지 않으므로 disallowed_useragent 원천 차단
   */
  const handleGoogleNative = async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setLoading(true);
      setLoadingProvider('google');
      startStatus('Google');

      if (Platform.OS !== 'android') {
        throw new Error('Google 네이티브 로그인은 현재 Android에서만 활성화되어 있습니다.');
      }

      // 1) Play Services 확인
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // 2) 혹시 이전 로그인 잔존하면 깨끗하게 정리
      try {
        await GoogleSignin.signOut();
      } catch {
        // ignore
      }

      // 3) 로그인
      const userInfo = await GoogleSignin.signIn();

      const idToken = userInfo?.data?.idToken ?? userInfo?.idToken;
      if (!idToken) {
        throw new Error('Google에서 idToken을 받지 못했습니다. (webClientId 설정을 확인하세요)');
      }

      // 4) Supabase에 idToken으로 로그인
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;

      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[AuthLanding] session after google native login:', !!sessionData.session);
    } catch (e: any) {
      console.log('[AuthLanding] Google Native error:', e?.message ?? e);

      // 사용자 취소 케이스는 조용히 처리하거나 메시지 최소화
      const msg = String(e?.message ?? e);

      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        // 유저가 취소한 경우: 굳이 실패 Alert 안 띄우는 게 UX 좋음
        return;
      }
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google 로그인 실패', 'Google Play 서비스가 필요합니다.');
        return;
      }

      Alert.alert('Google 로그인 실패', msg);
    } finally {
      setLoading(false);
      setLoadingProvider(null);
      endStatus();
      lockRef.current = false;
    }
  };

  /**
   * ✅ Apple: 네이티브 로그인 → identityToken → Supabase signInWithIdToken
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
        <Text allowFontScaling={false} style={{ fontSize: 30, fontFamily: 'PretendardBold', color: colors.primary }}>
          DOTORING
        </Text>

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
            <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 16 }}>
              {statusMsg}
            </Text>
          </View>
        )}

        <Text
          allowFontScaling={false}
          style={{ marginTop: 12, color: colors.subtext, fontSize: 13, textAlign: 'center', lineHeight: 19 }}
        >
          잊어버리기 쉬운 작은 것들을{'\n'}도토링이 대신 기억해줄게요.
        </Text>
      </View>

      <SectionCard style={{ paddingTop: 18, paddingBottom: 18 }}>
        {/* Google (Android Native) */}
        <TouchableOpacity
          onPress={handleGoogleNative}
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
                <Text allowFontScaling={false} style={{ fontSize: 14, color: '#111', fontFamily: 'PretendardBold' }}>
                  진행 중...
                </Text>
              </>
            ) : (
              <Text allowFontScaling={false} style={{ fontSize: 14, color: '#111', fontFamily: 'PretendardBold' }}>
                Google로 계속하기
              </Text>
            )}
          </View>
          <View style={{ width: 18 }} />
        </TouchableOpacity>

        {/* Apple (iOS Native) */}
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
              <Text allowFontScaling={false} style={{ width: 18, color: '#fff', fontSize: 16, textAlign: 'center' }}>
                
              </Text>
              <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                {loadingProvider === 'apple' ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <View style={{ width: 8 }} />
                    <Text allowFontScaling={false} style={{ fontSize: 14, color: '#fff', fontFamily: 'PretendardBold' }}>
                      진행 중...
                    </Text>
                  </>
                ) : (
                  <Text allowFontScaling={false} style={{ fontSize: 14, color: '#fff', fontFamily: 'PretendardBold' }}>
                    Apple로 계속하기
                  </Text>
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
          <Text allowFontScaling={false} style={{ fontSize: 12, color: colors.subtext, textDecorationLine: 'underline' }}>
            비밀번호를 잊으셨나요?
          </Text>
        </TouchableOpacity>
      </SectionCard>

      <View style={{ marginTop: 18, alignItems: 'center' }}>
        <Text allowFontScaling={false} style={{ fontSize: 11, color: colors.subtext, textAlign: 'center' }}>
          계속하면 개인정보 처리방침에 동의한 것으로 간주됩니다.
        </Text>
      </View>
    </ScreenContainer>
  );
}
