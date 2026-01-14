// src/navigation/AppNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import RootNavigator from './RootNavigator';
import AuthNavigator from './AuthNavigator';

export type AppStackParamList = {
  MainStack: undefined;
  AuthStack: {
    screen?: 'AuthLanding' | 'EmailAuth' | 'ForgotPassword' | 'ResetPassword' | 'PrivacyPolicy';
    params?: any;
  } | undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="MainStack" component={RootNavigator} />
      <Stack.Screen name="AuthStack" component={AuthNavigator} />
    </Stack.Navigator>
  );
}
