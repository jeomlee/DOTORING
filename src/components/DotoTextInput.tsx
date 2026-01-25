import React from 'react';
import { TextInput, TextInputProps, Platform, TextStyle } from 'react-native';

export default function DotoTextInput(props: TextInputProps) {
  return (
    <TextInput
      {...props}
      allowFontScaling={false}
      style={[
        Platform.OS === 'android' ? ({ includeFontPadding: false } as TextStyle) : null,
        props.style,
      ]}
    />
  );
}
