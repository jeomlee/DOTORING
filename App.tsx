// App.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';

import RootNavigator from './src/navigation/RootNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import { supabase } from './src/api/supabaseClient';
import { linking } from './src/navigation/linking';

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

// ---- recovery 판별 ----
function hasAnyParam(url: string, key: string) {
  return url.includes(`${key}=`) || url.includes(`${key}%3D`);
}

function isRecoveryUrl(url?: string | null) {
  if (!url) return false;

  // 1) type=recovery 최우선
  if (url.includes('type=recovery')) return true;

  // 2) 토큰/코드가 붙은 auth 링크도 recovery로 취급 (환경별 차이 대비)
  const hasCode = hasAnyParam(url, 'code');
  const hasTokens = hasAnyParam(url, 'access_token') && hasAnyParam(url, 'refresh_token');

  // 3) 경로 기반
  const looksRecoveryPath = url.includes('auth/recovery');

  if (looksRecoveryPath) return true;
  if (hasCode || hasTokens) return true;

  return false;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // ✅ 핵심: recoveryMode일 땐 "세션이 있든 없든" AuthNavigator(ResetPassword)를 강제 표시
  const [recoveryMode, setRecoveryMode] = useState(false);
  const recoveryModeRef = useRef(false);

  // ✅ recovery로 들어온 원본 URL을 ResetPasswordScreen에 넘김
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);

  const setRecoveryModeSafe = (v: boolean) => {
    recoveryModeRef.current = v;
    setRecoveryMode(v);
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
        // ✅ 1) initial URL 먼저 확인 (앱이 링크로 켜진 경우)
        const initialUrl = await Linking.getInitialURL();
        console.log('[App] initialUrl =', initialUrl);

        if (mounted && isRecoveryUrl(initialUrl)) {
          console.log('[App] recoveryMode ON (initialUrl)');
          setRecoveryModeSafe(true);
          setRecoveryUrl(initialUrl!);
        }

        // ✅ 2) 세션 읽기
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        console.log('[App] getSession:', !!data.session, data.session?.user?.email);
        setSession(data.session ?? null);
        setBooting(false);

        // ✅ 3) auth change는 "세션 상태만 업데이트" (네비 reset 절대 하지 말기)
        const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (!mounted) return;

          console.log('[App] onAuthStateChange:', event, !!newSession);
          setSession(newSession ?? null);

          // ✅ recovery 중에는 어떤 이벤트가 와도 화면 강제 이동 금지
          if (recoveryModeRef.current) {
            console.log('[App] recoveryMode active -> ignore navigation side effects');
            return;
          }
        });
        authSub = sub.subscription;

        // ✅ 4) 앱 실행 중 url 이벤트 (메일 링크 클릭 등)
        urlSub = Linking.addEventListener('url', (event) => {
          console.log('[App] url event =', event.url);

          if (!isRecoveryUrl(event.url)) return;

          console.log('[App] recoveryMode ON (url event)');
          setRecoveryModeSafe(true);
          setRecoveryUrl(event.url);
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
        <NavigationContainer linking={linking}>
          {/* ✅ 1순위: recoveryMode면 무조건 ResetPassword */}
          {recoveryMode ? (
            <AuthNavigator
              initialRouteName="ResetPassword"
              initialParams={recoveryUrl ? { url: recoveryUrl } : undefined}
              onExitRecovery={() => {
                console.log('[App] recoveryMode OFF');
                setRecoveryModeSafe(false);
                setRecoveryUrl(null);

                // ✅ 보안/일관성: recovery 종료 시 로그인 화면으로(세션 꼬임 방지)
                // (ResetPasswordScreen에서 이미 signOut을 했어도 문제 없음)
                supabase.auth.signOut().catch(() => {});
              }}
            />
          ) : session ? (
            <RootNavigator />
          ) : (
            <AuthNavigator />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
