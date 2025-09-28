/**
 * @description
 * This file defines the main application navigation for authenticated users,
 * structured as a bottom tab navigator. It provides access to the core sections
 * of the app: Home, Payments, Analytics, and Profile.
 *
 * @dependencies
 * - @react-navigation/bottom-tabs: For creating the tab-based navigator.
 * - @expo/vector-icons: Provides the icon set (Ionicons) used in the tab bar.
 * - Screens: Imports the main screens for the application.
 * - @/constants/theme: For consistent styling of the tab bar.
 *
 * @notes
 * - This component is intended to be nested within a stack navigator (`AppStack`)
 *   to allow for modal screens to be displayed over the tabs.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '@/screens/Home/HomeScreen';
import PaymentsScreen from '@/screens/Payments/PaymentsScreen';
import AnalyticsScreen from '@/screens/Analytics/AnalyticsScreen';
import ProfileScreen from '@/screens/Profile/ProfileScreen';
import { theme } from '@/constants/theme';

// Define the parameter list for the AppTabs routes for type safety.
export type AppTabsParamList = {
  Home: undefined;
  Payments: undefined;
  Analytics: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Helper function to get icon name based on route and focus state
const getIconName = (routeName: string, focused: boolean): IconName => {
  switch (routeName) {
    case 'Home':
      return focused ? 'home' : 'home-outline';
    case 'Payments':
      return focused ? 'swap-horizontal' : 'swap-horizontal-outline';
    case 'Analytics':
      return focused ? 'stats-chart' : 'stats-chart-outline';
    case 'Profile':
      return focused ? 'person' : 'person-outline';
    default:
      return 'ellipse'; // Default fallback icon
  }
};

interface TabBarIconProps {
  route: { name: string };
  focused: boolean;
  color: string;
  size: number;
}

// Define the tab bar icon component outside of the AppTabs component for performance
const TabBarIcon: React.FC<TabBarIconProps> = React.memo(({ route, focused, color, size }) => (
  <Ionicons name={getIconName(route.name, focused)} size={size} color={color} />
));

const AppTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <TabBarIcon route={route} focused={focused} color={color} size={size} />
        ),
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: false, // Hiding default headers to use custom ones per screen
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default AppTabs;
