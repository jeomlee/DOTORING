// src/navigation/linking.ts
import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';

// ✅ prefix: 커스텀 스킴 + Expo createURL
const prefixes = ['dotoring://', Linking.createURL('/')];

export const linking: LinkingOptions<any> = {
  prefixes,

  // ✅ 초기 URL도 Navigation이 가져가지만,
  // App.tsx에서 recoveryMode로 강제 진입 처리도 하고 있으니 이중 안전장치가 됨.
  config: {
    screens: {
      // ===== Auth (로그인 전) =====
      AuthLanding: 'auth',
      EmailAuth: 'email-auth',
      ForgotPassword: 'forgot-password',

      /**
       * ✅ ResetPassword
       * - Supabase password recovery 링크가 환경에 따라:
       *   1) dotoring://auth/recovery#access_token=...&type=recovery
       *   2) dotoring://auth/v1/callback?code=...
       *   3) dotoring://auth/callback?code=...
       * 로 들어올 수 있음.
       *
       * 아래처럼 "alias"로 여러 path를 같은 화면으로 매핑한다.
       */
      ResetPassword: {
        path: 'auth/recovery',
        // @ts-ignore (react-navigation 버전에 따라 alias 타입이 엄격할 수 있음)
        alias: ['auth/v1/callback', 'auth/callback'],
      },

      // ⚠️ PrivacyPolicy는 한 군데만
      PrivacyPolicy: 'privacy-policy',

      // ===== Main (로그인 후) =====
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

  /**
   * ✅ getInitialURL / subscribe를 커스텀하고 싶으면 여기서도 가능하지만,
   * 지금은 App.tsx가 recovery를 강제 처리하고 있어서 기본 동작으로 충분.
   */
};
