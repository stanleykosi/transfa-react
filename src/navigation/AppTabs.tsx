import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { NavigatorScreenParams } from '@react-navigation/native';

import HomeScreen from '@/screens/Home/HomeScreen';
import ProfileStack, { ProfileStackParamList } from './ProfileStack';
import MoneyDropTabScreen from '@/screens/MoneyDrop/MoneyDropTabScreen';
import SupportScreen from '@/screens/Support/SupportScreen';

export type AppTabsParamList = {
  Home: undefined;
  Settings: NavigatorScreenParams<ProfileStackParamList>;
  MoneyDrop: undefined;
  Support: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

const resolveIconName = (routeName: keyof AppTabsParamList, focused: boolean): TabIconName => {
  switch (routeName) {
    case 'Home':
      return focused ? 'home' : 'home-outline';
    case 'Settings':
      return focused ? 'settings' : 'settings-outline';
    case 'MoneyDrop':
      return focused ? 'gift' : 'gift-outline';
    case 'Support':
      return focused ? 'headset' : 'headset-outline';
    default:
      return 'ellipse';
  }
};

const AppTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#FFD300',
        tabBarInactiveTintColor: '#A0A1A4',
        tabBarStyle: styles.tabBar,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={resolveIconName(route.name as keyof AppTabsParamList, focused)}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Settings" component={ProfileStack} />
      <Tab.Screen name="MoneyDrop" component={MoneyDropTabScreen} />
      <Tab.Screen name="Support" component={SupportScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 52,
    right: 52,
    bottom: 24,
    height: 56,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: '#080A0D',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1A1D22',
    paddingBottom: 2,
    paddingTop: 2,
  },
  tabBarIcon: {
    marginTop: 2,
  },
});

export default AppTabs;
