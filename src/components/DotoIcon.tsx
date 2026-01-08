import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const ICON = require('../assets/DOTORING.png');

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export default function DotoIcon({ size = 20, style }: Props) {
  return (
    <Image
      source={ICON}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}
