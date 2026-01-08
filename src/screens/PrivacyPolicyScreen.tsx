import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';

export default function PrivacyPolicyScreen() {
  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={title}>개인정보 처리방침 🔐</Text>

        <Text style={desc}>
          도토링은 서비스 제공에 필요한 최소한의 정보만 처리해요.
          {'\n'}본 방침은 앱 이용 중 처리되는 개인정보와 목적을 안내합니다.
        </Text>

        <View style={{ marginTop: 18 }}>
          <Text style={section}>1. 수집하는 정보</Text>
          <Text style={body}>
            - 이메일(로그인/계정 식별){'\n'}
            - 사용자가 저장한 항목 정보(예: 쿠폰/이벤트/혜택/일정/기타) — 제목/메모/카테고리/날짜 등{'\n'}
            - 사용자가 업로드한 이미지(선택){'\n'}
            - 알림 설정값(알림 여부/알림 시점)
          </Text>

          <Text style={section}>2. 이용 목적</Text>
          <Text style={body}>
            - 항목 저장 및 기기 간 동기화{'\n'}
            - 알림 제공(예: 만료/예정 알림){'\n'}
            - 서비스 안정화 및 오류 대응
          </Text>

          <Text style={section}>3. 보관 및 삭제</Text>
          <Text style={body}>
            - 계정 유지 기간 동안 보관돼요.{'\n'}
            - 앱에서 계정 삭제 시 저장한 항목/이미지 포함 데이터는 삭제돼요.
          </Text>

          <Text style={section}>4. 제3자 제공 및 외부 서비스</Text>
          <Text style={body}>
            - 도토링은 원칙적으로 개인정보를 제3자에게 제공하지 않아요.{'\n'}
            - 도토링은 Supabase를 사용해 로그인/데이터/이미지를 저장하고 관리해요.
          </Text>

          <Text style={section}>5. 문의</Text>
          <Text style={body}>
            개인정보 관련 문의는 앱 내 ‘문의하기’로 연락해주세요.
          </Text>

          <Text style={date}>시행일자: 2025.12.23</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const title = {
  fontSize: 22,
  fontFamily: 'PretendardBold',
  color: colors.text,
};

const desc = {
  marginTop: 10,
  fontSize: 13,
  color: colors.subtext,
  lineHeight: 20,
};

const section = {
  marginTop: 16,
  fontSize: 15,
  fontFamily: 'PretendardBold',
  color: colors.text,
};

const body = {
  marginTop: 6,
  fontSize: 13,
  color: colors.subtext,
  lineHeight: 20,
};

const date = {
  marginTop: 22,
  fontSize: 12,
  color: colors.subtext,
};
