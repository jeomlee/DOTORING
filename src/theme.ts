import { Text, TextInput } from 'react-native';

export const colors = {
  primary: '#8B5E3C',
  secondary: '#C6A589',
  background: '#FAF7F2',
  card: '#F7F3EE',
  text: '#3A3A3A',
  subtext: '#666666',
  accent: '#4D6A4A',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
};

export const radius = {
  lg: 14,
  xl: 18,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  } as any,
};

export const typography = {
  regular: 'PretendardStd-Regular',
  semibold: 'PretendardStd-SemiBold',
  bold: 'PretendardStd-Bold',
};

// ✅ 전역 폰트 적용 함수 (네가 기존에 호출하던 함수)
export function applyGlobalFont(fontFamily: string = typography.regular) {
  // Text
  // @ts-ignore
  Text.defaultProps = Text.defaultProps || {};
  // @ts-ignore
  Text.defaultProps.style = [Text.defaultProps.style, { fontFamily }];

  // TextInput
  // @ts-ignore
  TextInput.defaultProps = TextInput.defaultProps || {};
  // @ts-ignore
  TextInput.defaultProps.style = [TextInput.defaultProps.style, { fontFamily }];
}
