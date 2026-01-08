import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';

export default function ContactScreen() {
  const email = 'jungmolee26@gmail.com';

  const copyEmail = async () => {
    await Clipboard.setStringAsync(email);
    Alert.alert('복사됨', '이메일 주소가 클립보드에 복사됐어요.');
  };

  return (
    <ScreenContainer>
      <Text
        style={{
          fontSize: 22,
          fontFamily: 'PretendardBold',
          color: colors.text,
          marginBottom: 12,
        }}
      >
        문의하기 ✉️
      </Text>

      <Text style={{ color: colors.subtext, marginBottom: 24 }}>
        불편한 점이나 제안이 있다면 언제든 편하게 연락 주세요.
      </Text>

      <View
        style={{
          backgroundColor: colors.card,
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#E0D9CF',
        }}
      >
        <Text style={{ fontSize: 14, color: colors.text, marginBottom: 8 }}>
          문의 이메일
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontFamily: 'PretendardBold',
            color: colors.primary,
            marginBottom: 12,
          }}
        >
          {email}
        </Text>

        <Pressable
          onPress={copyEmail}
          style={{
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.accent,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'PretendardBold' }}>
            이메일 주소 복사
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}
