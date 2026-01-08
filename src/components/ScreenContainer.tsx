import React from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: any;
  includeBottomSafeArea?: boolean;
};

export default function ScreenContainer({
  children,
  style,
  includeBottomSafeArea = false,
}: Props) {
  const edges: Edge[] = includeBottomSafeArea
    ? ['top', 'left', 'right', 'bottom']
    : ['top', 'left', 'right'];

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 6 : 0,
  },
});
