import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';

import { supabase } from '../api/supabaseClient';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';

type Mode = 'login' | 'signup';

const MIN_PASSWORD_LEN = 6;

export default function EmailAuthScreen({ navigation }: any) {
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordCheck, setPasswordCheck] = useState('');

  const [loading, setLoading] = useState(false);

  // ✅ Alert 남발 대신 인라인 메시지
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<'info' | 'error'>('info');

  const setError = (text: string) => {
    setMsgType('error');
    setMsg(text);
  };
  const setInfo = (text: string) => {
    setMsgType('info');
    setMsg(text);
  };

  const emailOk = useMemo(() => {
    const v = email.trim();
    if (!v) return false;
    return v.includes('@') && v.includes('.');
  }, [email]);

  const canSubmit = useMemo(() => {
    if (!emailOk) return false;
    if (!password.trim()) return false;

    if (mode === 'signup') {
      if (password.trim().length < MIN_PASSWORD_LEN) return false;
      if (password !== passwordCheck) return false;
    }

    return true;
  }, [emailOk, password, passwordCheck, mode]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('이메일/비밀번호를 확인해 주세요.');
      return;
    }

    setLoading(true);
    setMsg(null);

    const trimmedEmail = email.trim();
    const rawPw = password;
    const pw = password.trim();

    // ✅ 공통 디버그 로그
    console.log('[EmailAuth] submit', {
      mode,
      email: trimmedEmail,
      pwLen: rawPw?.length ?? 0,
      pwTrimmedLen: pw?.length ?? 0,
    });

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: rawPw, // ✅ trim 하지 않음 (사용자가 입력한 그대로)
        });

        // ✅ 상세 로그
        console.log('[EmailAuth] signInWithPassword data:', data);
        console.log('[EmailAuth] signInWithPassword error:', error);

        if (error) {
          const lower = (error.message || '').toLowerCase();

          if (lower.includes('email not confirmed')) {
            setError('이메일 인증이 필요합니다. 메일함에서 인증 링크를 눌러 주세요.');
          } else if (lower.includes('invalid login credentials')) {
            setError('계정이 없거나 비밀번호가 다릅니다. 처음이시면 회원가입으로 전환해 주세요.');
          } else {
            setError(error.message);
          }
          return;
        }

        // ✅ 로그인 성공 시 현재 유저/세션 확인 로그
        const { data: s } = await supabase.auth.getSession();
        const { data: u } = await supabase.auth.getUser();
        console.log('[EmailAuth] session after login:', !!s.session, s.session?.user?.email);
        console.log('[EmailAuth] user after login:', u.user?.email, u.user?.id);

        // 네비게이션은 App.tsx에서 session 상태로 갈리므로 여기서 강제 이동 X
      } else {
        if (pw.length < MIN_PASSWORD_LEN) {
          setError(`비밀번호는 최소 ${MIN_PASSWORD_LEN}자 이상이어야 합니다.`);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: pw,
          // options: { emailRedirectTo: 'https://.../auth/confirm' } // 필요 시 추가
        });

        // ✅ 상세 로그
        console.log('[EmailAuth] signUp data:', data);
        console.log('[EmailAuth] signUp error:', error);

        if (error) {
          setError(error.message);
          return;
        }

        setInfo('회원가입이 완료되었습니다. 이메일로 전송된 인증 링크를 눌러 주세요.');
      }
    } catch (e: any) {
      console.log('[EmailAuth] exception:', e);
      setError(e?.message ?? '처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 상단 */}
        <View style={{ marginTop: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: 'PretendardBold', color: colors.text }}>
            {mode === 'login' ? '이메일로 로그인' : '이메일로 회원가입'}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>
            {mode === 'login'
              ? '계정이 없으시면 회원가입으로 전환해 주세요.'
              : '가입 후 이메일 인증을 완료해야 로그인할 수 있습니다.'}
          </Text>
        </View>

        {/* 폼 */}
        <SectionCard style={{ paddingTop: 16, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13, color: colors.subtext, marginBottom: 4 }}>
            이메일
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (msg) setMsg(null);
            }}
            placeholder="example@email.com"
            placeholderTextColor="#C1B9B0"
            style={{
              borderWidth: 1,
              borderColor: '#E0D8CF',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              marginBottom: 12,
              fontFamily: 'Pretendard',
              color: colors.text,
            }}
          />

          <Text style={{ fontSize: 13, color: colors.subtext, marginBottom: 4 }}>
            비밀번호
          </Text>
          <TextInput
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (msg) setMsg(null);
            }}
            secureTextEntry
            placeholder={mode === 'signup' ? `최소 ${MIN_PASSWORD_LEN}자 이상` : '비밀번호'}
            placeholderTextColor="#C1B9B0"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: '#E0D8CF',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              marginBottom: mode === 'signup' ? 12 : 6,
              fontFamily: 'Pretendard',
              color: colors.text,
            }}
          />

          {mode === 'signup' && (
            <>
              <Text style={{ fontSize: 13, color: colors.subtext, marginBottom: 4 }}>
                비밀번호 확인
              </Text>
              <TextInput
                value={passwordCheck}
                onChangeText={(v) => {
                  setPasswordCheck(v);
                  if (msg) setMsg(null);
                }}
                secureTextEntry
                placeholder="한 번 더 입력해 주세요"
                placeholderTextColor="#C1B9B0"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: '#E0D8CF',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 6,
                  fontFamily: 'Pretendard',
                  color: colors.text,
                }}
              />
            </>
          )}

          {/* ✅ 로그인 모드에서만 “비밀번호 찾기” 페이지로 이동 */}
          {mode === 'login' && (
            <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.primary,
                    fontFamily: 'PretendardBold',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  비밀번호를 잊으셨나요?
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {msg && (
            <View style={{ marginTop: 10 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: msgType === 'error' ? '#C65B5B' : colors.accent,
                  lineHeight: 18,
                }}
              >
                {msg}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 14 }}>
            <DotoButton
              title={loading ? '진행 중...' : mode === 'login' ? '로그인' : '회원가입'}
              onPress={handleSubmit}
              disabled={loading || !canSubmit}
              style={{
                backgroundColor: colors.primary,
                opacity: loading || !canSubmit ? 0.6 : 1,
              }}
            />
          </View>

          {/* 모드 전환 + 뒤로 */}
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => {
                setMode((m) => (m === 'login' ? 'signup' : 'login'));
                setMsg(null);
              }}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'PretendardBold' }}>
                {mode === 'login' ? '처음이신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: colors.subtext }}>← 다른 방법 선택하기</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
