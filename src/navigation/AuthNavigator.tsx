// src/navigation/AuthNavigator.tsx
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
  ResetPassword: { url?: string } | undefined;
  PrivacyPolicy: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator({
  onExitRecovery,
}: {
  onExitRecovery?: () => void;
}) {
  return (
    <Stack.Navigator
      initialRouteName="AuthLanding"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword">
        {(props) => <ResetPasswordScreen {...props} onExitRecovery={onExitRecovery} />}
      </Stack.Screen>
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}
