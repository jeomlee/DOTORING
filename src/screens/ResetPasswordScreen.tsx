import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { useRoute } from '@react-navigation/native';

import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import { colors } from '../theme';
import { supabase } from '../api/supabaseClient';

type Params = Record<string, any>;

function parseParamsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  try {
    const qIndex = url.indexOf('?');
    const hIndex = url.indexOf('#');

    const queryPart = qIndex >= 0 ? url.slice(qIndex + 1, hIndex >= 0 ? hIndex : undefined) : '';
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

    // expo-linking parse 보강
    const parsed = Linking.parse(url);
    const qp = (parsed.queryParams ?? {}) as Record<string, any>;
    Object.keys(qp).forEach((k) => {
      if (out[k] != null) return;
      const v = qp[k];
      if (v === undefined || v === null) return;
      out[k] = String(v);
    });
  } catch {
    // ignore
  }

  return out;
}

function normalizeAnyParams(p?: Params): Record<string, string> {
  const out: Record<string, string> = {};
  if (!p) return out;
  Object.keys(p).forEach((k) => {
    const v = p[k];
    if (v === undefined || v === null) return;
    out[k] = String(v);
  });
  return out;
}

export default function ResetPasswordScreen({
  navigation,
  onExitRecovery,
}: {
  navigation: any;
  onExitRecovery?: () => void;
}) {
  const route = useRoute<any>();

  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  // ✅ 성공 후 signOut 시 세션이 사라져도 이 화면이 흔들리지 않게 고정
  const [completed, setCompleted] = useState(false);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  const routeParams = useMemo(() => normalizeAnyParams(route?.params), [route?.params]);

  const setSessionFromParams = async (p: Record<string, string>) => {
    console.log('[ResetPassword] incoming keys:', Object.keys(p));

    if (p.error_description || p.error) {
      throw new Error(p.error_description || p.error);
    }

    /**
     * Supabase recovery 링크는 환경에 따라:
     * - PKCE: ?code=... (&type=recovery가 없을 수도 있음)
     * - Implicit: #access_token=...&refresh_token=...&type=recovery
     */
    const hasCode = !!p.code;
    const hasTokens = !!(p.access_token && p.refresh_token);

    // ✅ 1) PKCE code flow: type이 없더라도 code가 있으면 일단 교환 시도
    if (hasCode) {
      console.log('[ResetPassword] exchangeCodeForSession...');
      const { error } = await supabase.auth.exchangeCodeForSession(p.code);
      if (error) throw error;
      return true;
    }

    // ✅ 2) Implicit token flow
    if (hasTokens) {
      console.log('[ResetPassword] setSession via tokens...');
      const { error } = await supabase.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });
      if (error) throw error;
      return true;
    }

    // ✅ 3) Already has session
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      console.log('[ResetPassword] session already exists');
      return true;
    }

    return false;
  };

  const handleIncoming = async (source: 'route' | 'url', payload: Record<string, string>) => {
    const ok = await setSessionFromParams(payload);
    if (!ok) {
      throw new Error(
        source === 'route'
          ? '복구 정보가 앱으로 전달되지 않았어요. 메일의 링크를 다시 눌러주세요.'
          : '복구 링크에서 세션 정보를 찾지 못했어요. 메일의 링크를 다시 눌러주세요.'
      );
    }
  };

  useEffect(() => {
    if (completed) return; // ✅ 완료 후 링크/세션 재처리 중단

    let sub: any;
    let cancelled = false;

    (async () => {
      try {
        setChecking(true);

        /**
         * ✅ A) route.params 우선
         * - App.tsx에서 initialParams={{ url: recoveryUrl }} 로 넘긴 케이스 처리
         */
        if (Object.keys(routeParams).length > 0) {
          console.log('[ResetPassword] try route.params first:', routeParams);

          if (routeParams.url) {
            const p = parseParamsFromUrl(routeParams.url);
            await handleIncoming('route', p);
          } else {
            await handleIncoming('route', routeParams);
          }

          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        /**
         * ✅ B) initial URL
         */
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          console.log('[ResetPassword] initialUrl:', initialUrl);
          const p = parseParamsFromUrl(initialUrl);
          await handleIncoming('url', p);

          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        /**
         * ✅ C) 마지막: 세션 확인
         */
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setReady(!!data.session);
          setChecking(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.log('[ResetPassword] handle error:', e?.message ?? e);
          setChecking(false);
          setReady(false);
          Alert.alert('복구 링크 처리 실패', e?.message ?? String(e));
        }
      }

      /**
       * ✅ D) 이후 url 이벤트
       */
      sub = Linking.addEventListener('url', (event) => {
        if (completed) return;

        console.log('[ResetPassword] url event:', event.url);
        const p = parseParamsFromUrl(event.url);

        setChecking(true);
        handleIncoming('url', p)
          .then(() => {
            setReady(true);
          })
          .catch((e: any) => {
            console.log('[ResetPassword] url event handle error:', e?.message ?? e);
            setReady(false);
            Alert.alert('복구 링크 처리 실패', e?.message ?? String(e));
          })
          .finally(() => {
            setChecking(false);
          });
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, [routeParams, completed]);

  const updatePassword = async () => {
    if (!pw1 || pw1.length < 6) {
      Alert.alert('비밀번호는 6자 이상으로 입력해주세요');
      return;
    }
    if (pw1 !== pw2) {
      Alert.alert('비밀번호가 서로 달라요. 다시 확인해주세요.');
      return;
    }

    try {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        throw new Error('세션이 만료되었어요. 메일의 재설정 링크를 다시 눌러주세요.');
      }

      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      // ✅ 완료 고정
      setCompleted(true);

      // ✅ 보안: 비번 변경 후 로그아웃 (이후 로그인 화면으로)
      await supabase.auth.signOut();

      Alert.alert('변경 완료', '이제 새 비밀번호로 로그인할 수 있어요.', [
        {
          text: '확인',
          onPress: () => {
            onExitRecovery?.();
            navigation.reset({ index: 0, routes: [{ name: 'AuthLanding' }] });
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('변경 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ marginTop: 24, marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }}>
          비밀번호 재설정
        </Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext, lineHeight: 18 }}>
          새 비밀번호를 입력해주세요.
        </Text>
      </View>

      <SectionCard>
        {checking ? (
          <Text style={{ fontSize: 12, color: colors.subtext }}>링크 확인 중...</Text>
        ) : completed ? (
          <Text style={{ fontSize: 12, color: colors.subtext }}>변경 완료! 로그인 화면으로 이동할게요…</Text>
        ) : !ready ? (
          <>
            <Text style={{ fontSize: 12, color: colors.subtext, lineHeight: 18 }}>
              복구 정보를 찾지 못했어요. 메일의 링크를 다시 눌러주세요.
            </Text>

            <View style={{ height: 12 }} />

            <DotoButton
              title="로그인으로 돌아가기"
              onPress={() => {
                onExitRecovery?.();
                navigation.reset({ index: 0, routes: [{ name: 'AuthLanding' }] });
              }}
            />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }}>새 비밀번호</Text>
            <TextInput
              value={pw1}
              onChangeText={setPw1}
              secureTextEntry
              placeholder="6자 이상"
              placeholderTextColor="#999"
              autoCapitalize="none"
              style={{
                height: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E0D8',
                paddingHorizontal: 12,
                color: colors.text,
                backgroundColor: '#fff',
              }}
            />

            <View style={{ height: 12 }} />

            <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }}>새 비밀번호 확인</Text>
            <TextInput
              value={pw2}
              onChangeText={setPw2}
              secureTextEntry
              placeholder="한 번 더 입력해주세요"
              placeholderTextColor="#999"
              autoCapitalize="none"
              style={{
                height: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E0D8',
                paddingHorizontal: 12,
                color: colors.text,
                backgroundColor: '#fff',
              }}
            />

            <View style={{ height: 14 }} />

            <DotoButton title={loading ? '변경 중...' : '비밀번호 변경'} onPress={updatePassword} disabled={loading} />
          </>
        )}
      </SectionCard>
    </ScreenContainer>
  );
}
