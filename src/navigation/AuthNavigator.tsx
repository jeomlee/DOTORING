import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AuthLandingScreen from '../screens/AuthLandingScreen';
import EmailAuthScreen from '../screens/EmailAuthScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';

export type AuthStackParamList = {
  AuthLanding: undefined;
  EmailAuth: undefined;
  ForgotPassword: undefined;

  // ✅ App.tsx에서 { url: recoveryUrl } 넘겨줄 수 있게 타입 확장
  ResetPassword: { url?: string } | undefined;

  PrivacyPolicy: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator({
  initialRouteName = 'AuthLanding',
  onExitRecovery,
  initialParams,
}: {
  initialRouteName?: keyof AuthStackParamList;
  onExitRecovery?: () => void;

  // ✅ App.tsx에서 AuthNavigator에 initialParams={{ url: recoveryUrl }} 넘기는 용도
  initialParams?: { url?: string } | null;
}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

      <Stack.Screen
        name="ResetPassword"
        // ✅ 여기! App.tsx에서 넘어온 url을 ResetPassword의 route.params로 주입
        initialParams={initialParams ?? undefined}
      >
        {(props) => <ResetPasswordScreen {...props} onExitRecovery={onExitRecovery} />}
      </Stack.Screen>

      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}
