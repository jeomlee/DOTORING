import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import DotoText from '../components/DotoText';

import TodayScreen from '../screens/TodayScreen';
import DotorihamScreen from '../screens/DotorihamScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ForestScreen from '../screens/ForestScreen';
import SettingsScreen from '../screens/SettingsScreen';

import AddCouponScreen from '../screens/AddCouponScreen';
import CouponDetailScreen from '../screens/CouponDetailScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import ContactScreen from '../screens/ContactScreen';
import ExpiringListScreen from '../screens/ExpiringListScreen';

export type MainTabParamList = {
  Today: undefined;
  Box: undefined;
  Calendar: undefined;
  Forest: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;

  AddCoupon: undefined;
  CouponDetail: { couponId: string };
  PrivacyPolicy: undefined;
  Contact: undefined;
  ExpiringList: { preset: 'today' | 'urgent' | 'soon'; leadDays?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const LABEL_MAP: Record<keyof MainTabParamList, string> = {
  Today: '오늘',
  Box: '도토리함',
  Calendar: '달력',
  Forest: '숲',
  Settings: '설정',
};

function MainTabs() {
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(() => {
    const baseHeight = Platform.OS === 'ios' ? 54 : 56;

    return {
      backgroundColor: '#FFF',
      borderTopColor: '#EFE7DF',
      borderTopWidth: 1,
      height: baseHeight + insets.bottom,
      paddingTop: 6,
      paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8),
    } as const;
  }, [insets.bottom]);

  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8F7E6C',
        tabBarHideOnKeyboard: true,
        tabBarStyle,

        // ✅ 핵심: 라벨을 직접 렌더링해서 allowFontScaling=false 강제
        tabBarLabel: ({ color }) => (
          <DotoText
            style={{
              fontSize: 10,
              fontFamily: 'PretendardBold',
              color,
              marginBottom: 2,
            }}
          >
            {LABEL_MAP[route.name as keyof MainTabParamList] ?? route.name}
          </DotoText>
        ),

        tabBarIcon: ({ color, size }) => {
          const iconSize = size ?? 20;
          switch (route.name) {
            case 'Today':
              return <Ionicons name="sunny-outline" size={iconSize} color={color} />;
            case 'Box':
              return <Ionicons name="file-tray-full-outline" size={iconSize} color={color} />;
            case 'Calendar':
              return <Ionicons name="calendar-outline" size={iconSize} color={color} />;
            case 'Forest':
              return <Ionicons name="leaf-outline" size={iconSize} color={color} />;
            case 'Settings':
              return <Ionicons name="settings-outline" size={iconSize} color={color} />;
            default:
              return <Ionicons name="ellipse-outline" size={iconSize} color={color} />;
          }
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Box" component={DotorihamScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Forest" component={ForestScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />

      <Stack.Screen name="AddCoupon" component={AddCouponScreen} />
      <Stack.Screen name="CouponDetail" component={CouponDetailScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="Contact" component={ContactScreen} />
      <Stack.Screen name="ExpiringList" component={ExpiringListScreen} />
    </Stack.Navigator>
  );
}
