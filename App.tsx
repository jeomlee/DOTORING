// App.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/api/supabaseClient';
import AuthNavigator from './src/navigation/AuthNavigator';
import RootNavigator from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';

// ✅ 추가: 세션 종료 시 로컬 알림 정리
import { cancelAllLocalCouponNotifications } from './src/utils/couponNotifications';

export const navigationRef = createNavigationContainerRef<any>();

// ✅ 전역 폰트 스케일링 차단 (글자 커져서 깨짐 방지)
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.allowFontScaling = false;

(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.allowFontScaling = false;

type RootStackParamList = {
  AuthStack: { screen?: string; params?: any } | undefined;
  MainTabs: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function hasAnyParam(url: string, key: string) {
  return url.includes(`${key}=`) || url.includes(`${key}%3D`);
}

/**
 * ✅ 핵심: recovery는 "auth/recovery" + (type=recovery OR code OR tokens) 일 때만 true
 * ❌ auth/callback 은 절대 recovery로 취급하지 않음
 */
function isRecoveryUrl(url?: string | null) {
  if (!url) return false;

  const inRecoveryPath = url.includes('auth/recovery'); // dotoring://auth/recovery#...
  if (!inRecoveryPath) return false;

  if (url.includes('type=recovery')) return true;

  const hasCode = hasAnyParam(url, 'code');
  const hasTokens = hasAnyParam(url, 'access_token') && hasAnyParam(url, 'refresh_token');

  return hasCode || hasTokens;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // ✅ recovery 중에는 auth change로 메인/로그인 강제리셋 금지
  const recoveryModeRef = useRef(false);

  // ✅ 네비 준비 전 딥링크 들어오면 큐에 저장
  const pendingRecoveryUrlRef = useRef<string | null>(null);

  const setRecoveryMode = (v: boolean) => {
    recoveryModeRef.current = v;
  };

  const goAuthLanding = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.reset({
      index: 0,
      routes: [{ name: 'AuthStack', params: { screen: 'AuthLanding' } }],
    });
  };

  const goMain = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const forceGoResetPassword = (url: string) => {
    // ✅ 네비 준비 전이면 큐에 저장
    if (!navigationRef.isReady()) {
      pendingRecoveryUrlRef.current = url;
      return;
    }

    // ✅ RootStack에 AuthStack이 항상 존재하므로, 여기로 정확히 보낸다
    navigationRef.reset({
      index: 0,
      routes: [
        {
          name: 'AuthStack',
          params: {
            screen: 'ResetPassword',
            params: { url },
          },
        },
      ],
    });
  };

  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  useEffect(() => {
    let mounted = true;
    let urlSub: any;
    let authSub: any;

    (async () => {
      try {
        // 1) 초기 딥링크 확인
        const initialUrl = await Linking.getInitialURL();
        console.log('[App] initialUrl =', initialUrl);

        if (isRecoveryUrl(initialUrl)) {
          console.log('[App] recoveryMode ON (initialUrl)');
          setRecoveryMode(true);
          forceGoResetPassword(initialUrl!);
        }

        // 2) 세션 로드
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        console.log('[App] getSession:', !!data.session, data.session?.user?.email);
        setSession(data.session ?? null);
        setBooting(false);

        // 3) auth change
        const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mounted) return;

          console.log('[App] onAuthStateChange:', event, !!newSession, newSession?.user?.email);
          setSession(newSession ?? null);

          // ✅ 세션이 끊기면(로그아웃/만료/토큰에러) 디바이스 로컬 스케줄을 싹 정리
          if (!newSession) {
            try {
              await cancelAllLocalCouponNotifications();
            } catch (e) {
              console.log('[App] cancelAllLocalCouponNotifications error:', e);
            }
          }

          // ✅ recovery 중엔 절대 메인/로그인으로 강제 reset 하지 않음
          if (recoveryModeRef.current) {
            console.log('[App] recoveryMode active -> skip nav reset');
            return;
          }

          // ✅ 평소에는 세션에 따라 이동
          if (navigationRef.isReady()) {
            if (newSession) goMain();
            else goAuthLanding();
          }
        });
        authSub = sub.subscription;

        // 4) 딥링크 이벤트
        urlSub = Linking.addEventListener('url', (event) => {
          console.log('[App] url event =', event.url);

          if (!isRecoveryUrl(event.url)) return;

          console.log('[App] recoveryMode ON (url event)');
          setRecoveryMode(true);
          forceGoResetPassword(event.url);
        });
      } catch (e) {
        if (!mounted) return;
        console.log('[App] boot error:', e);
        setSession(null);
        setBooting(false);
      }
    })();

    return () => {
      mounted = false;
      urlSub?.remove?.();
      authSub?.unsubscribe?.();
    };
  }, []);

  if (booting) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          linking={linking}
          onReady={() => {
            console.log('[App] Navigation ready');

            // ✅ 큐에 있던 recovery url 처리
            const queued = pendingRecoveryUrlRef.current;
            if (queued && isRecoveryUrl(queued)) {
              pendingRecoveryUrlRef.current = null;
              setRecoveryMode(true);
              forceGoResetPassword(queued);
              return;
            }

            // ✅ 평소 초기 라우팅
            if (recoveryModeRef.current) return;

            if (session) goMain();
            else goAuthLanding();
          }}
        >
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            {/* ✅ 항상 존재 (언마운트 금지) */}
            <RootStack.Screen name="AuthStack">
              {(props) => (
                <AuthNavigator
                  {...props}
                  onExitRecovery={() => {
                    console.log('[App] recoveryMode OFF');
                    setRecoveryMode(false);
                    pendingRecoveryUrlRef.current = null;
                    goAuthLanding();
                  }}
                />
              )}
            </RootStack.Screen>

            <RootStack.Screen name="MainTabs" component={RootNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
