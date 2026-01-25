import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';

type Props = TextProps & {
  children?: React.ReactNode;
  style?: TextStyle | TextStyle[];
};

/**
 * ✅ 기본: allowFontScaling=false
 * - UI 깨짐 방지(탭 라벨/버튼/헤더/카드 텍스트 등)
 * - 필요하면 allowFontScaling={true}로 예외 허용 가능
 */
export default function DotoText({ allowFontScaling, style, ...props }: Props) {
  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling ?? false}
      // maxFontSizeMultiplier는 allowFontScaling=true일 때만 의미있지만,
      // 실수 방지 차원에서 1로 고정해둠.
      maxFontSizeMultiplier={1}
      style={style}
    />
  );
}
