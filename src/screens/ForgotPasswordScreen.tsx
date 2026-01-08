import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import * as Linking from 'expo-linking';

import ScreenContainer from '../components/ScreenContainer';
import SectionCard from '../components/SectionCard';
import DotoButton from '../components/DotoButton';
import { colors } from '../theme';
import { supabase } from '../api/supabaseClient';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const lockRef = useRef(false);

  const redirectTo = useMemo(() => {
    // ✅ 메일 링크 클릭 시 앱이 열리게 해야 함
    // ResetPasswordScreen에서 이 경로를 recovery로 인식할 수 있도록 맞춰줘
    // App.tsx에서 isRecoveryUrl이 type=recovery도 인식하지만, path도 맞추면 더 안정적
    return Linking.createURL('auth/recovery');
  }, []);

  const isValidEmail = (v: string) => {
    const s = v.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };

  const sendResetEmail = async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) {
        Alert.alert('이메일을 확인해주세요', '올바른 이메일 형식으로 입력해주세요.');
        return;
      }

      setLoading(true);

      // ✅ Supabase에 비밀번호 재설정 메일 발송 (redirectTo 중요)
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo,
      });

      if (error) throw error;

      Alert.alert(
        '메일을 보냈어요',
        '비밀번호 재설정 링크를 이메일에서 열어주세요.\n(링크를 누르면 DOTORING 앱이 열려야 합니다.)',
        [
          {
            text: '확인',
            onPress: () => {
              // ✅ 로그인(랜딩) 화면으로 복귀
              navigation.goBack?.() ?? navigation.navigate('AuthLanding');
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
      lockRef.current = false;
    }
  };

  return (
    <ScreenContainer>
      <View style={{ marginTop: 24, marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontFamily: 'PretendardBold', color: colors.text }}>
          비밀번호를 잊으셨나요?
        </Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext, lineHeight: 18 }}>
          가입한 이메일로 재설정 링크를 보내드릴게요.
        </Text>
      </View>

      <SectionCard>
        <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }}>이메일</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="example@email.com"
          placeholderTextColor="#999"
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

        <DotoButton
          title={loading ? '전송 중...' : '재설정 링크 보내기'}
          onPress={sendResetEmail}
          disabled={loading}
        />

        <View style={{ height: 10 }} />

        <DotoButton
          title="로그인으로 돌아가기"
          onPress={() => navigation.goBack?.() ?? navigation.navigate('AuthLanding')}
          disabled={loading}
          variant="secondary"
        />
      </SectionCard>

      <View style={{ marginTop: 18 }}>
        <Text style={{ fontSize: 11, color: colors.subtext, lineHeight: 16 }}>
          * 메일이 안 오면 스팸함/프로모션함도 확인해주세요.
        </Text>
      </View>
    </ScreenContainer>
  );
}
