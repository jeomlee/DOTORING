// src/navigation/linking.ts
import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['dotoring://', Linking.createURL('/')],

  config: {
    screens: {
      // ✅ RootStack
      AuthStack: {
        screens: {
          AuthLanding: 'auth',
          EmailAuth: 'email-auth',
          ForgotPassword: 'forgot-password',
          ResetPassword: 'auth/recovery',
          PrivacyPolicy: 'privacy-policy',
        },
      },

      MainTabs: {
        screens: {
          Today: 'today',
          Box: 'box',
          Calendar: 'calendar',
          Forest: 'forest',
          Settings: 'settings',
        },
      },

      AddCoupon: 'add-coupon',
      CouponDetail: 'coupon/:couponId',
      Contact: 'contact',
      ExpiringList: 'expiring',
    },
  },
};
