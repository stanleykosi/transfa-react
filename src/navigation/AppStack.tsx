/**
 * @description
 * This file defines the main application navigation stack for authenticated users.
 * It uses a bottom tab navigator to provide access to the core sections of the app.
 *
 * @dependencies
 * - @react-navigation/bottom-tabs: For creating the tab-based navigator.
 * - @expo/vector-icons: Provides the icon set (Ionicons) used in the tab bar.
 * - Screens: Imports the main screens for the application.
 * - @/constants/theme: For consistent styling of the tab bar.
 *
 * @notes
 * - Each tab is configured with a specific icon and label.
 * - The active and inactive tab colors are set from our global theme for consistency.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '@/screens/Home/HomeScreen';
import PaymentsScreen from '@/screens/Payments/PaymentsScreen';
import AnalyticsScreen from '@/screens/Analytics/AnalyticsScreen';
import ProfileScreen from '@/screens/Profile/ProfileScreen';
import { theme } from '@/constants/theme';

// Define the parameter list for the AppStack routes for type safety.
export type AppStackParamList = {
  Home: undefined;
  Payments: undefined;
  Analytics: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppStackParamList>();

// Helper function to get icon name based on route and focus state
const getIconName = (
  routeName: string,
  focused: boolean
): React.ComponentProps<typeof Ionicons>['name'] => {
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

// Define the tab bar icon component outside of the AppStack component
const TabBarIcon = React.memo(({ route, focused, color, size }: any) => (
  <Ionicons name={getIconName(route.name, focused)} size={size} color={color} />
));

const AppStack = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarIcon: TabBarIcon,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: false, // Hiding default headers to use custom ones per screen
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default AppStack;
