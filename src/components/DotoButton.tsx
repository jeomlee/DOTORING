import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export default function DotoButton({
  title,
  onPress,
  style,
  textStyle,
  disabled = false,
  variant = 'primary',
}: Props) {
  const backgroundColor =
    disabled
      ? '#D6CEC5'
      : variant === 'secondary'
        ? colors.card
        : variant === 'danger'
          ? '#C65B5B'
          : colors.primary;

  const textColor =
    disabled
      ? '#ffffff'
      : variant === 'secondary'
        ? colors.text
        : '#ffffff';

  const borderWidth = variant === 'secondary' ? 1 : 0;
  const borderColor = variant === 'secondary' ? '#E0D9CF' : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor, borderWidth, borderColor },
        style,
      ]}
      activeOpacity={0.85}
    >
      <Text style={[styles.text, { color: textColor }, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'PretendardBold',
    fontSize: 14,
    lineHeight: 18,
  },
});
