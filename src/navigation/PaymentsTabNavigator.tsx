/**
 * @description
 * Redesigned top tab navigator for the "Payments" section with CLEAR visual distinction.
 * Provides two tabs: "Transaction History" and "Payment Requests" with prominent labels,
 * icons, and visual indicators.
 *
 * @dependencies
 * - @react-navigation/material-top-tabs: For the tab navigator component
 * - Screens: Imports the PaymentHistoryScreen and PaymentRequestsListScreen
 * - @/constants/theme: For consistent styling
 */
import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import PaymentHistoryScreen from '@/screens/Payments/PaymentHistoryScreen';
import PaymentRequestsListScreen from '@/screens/PaymentRequests/PaymentRequestsListScreen';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export type PaymentsTabParamList = {
  History: undefined;
  Requests: undefined;
};

const Tab = createMaterialTopTabNavigator<PaymentsTabParamList>();

// Tab icon components moved outside to avoid nested component warning
const HistoryTabIcon = ({ color }: { color: string }) => (
  <Ionicons name="receipt" size={20} color={color} />
);

const RequestsTabIcon = ({ color }: { color: string }) => (
  <Ionicons name="document-text" size={20} color={color} />
);

const PaymentsTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarIndicatorStyle: {
          backgroundColor: theme.colors.primary,
          height: 4,
          borderRadius: 2,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 4,
          shadowOpacity: 0.15,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: '600',
          textTransform: 'none',
          margin: 0,
          padding: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 8,
        },
        tabBarShowLabel: true,
        tabBarShowIcon: true,
        tabBarPressColor: theme.colors.primaryLight,
        tabBarAllowFontScaling: false,
      }}
    >
      <Tab.Screen
        name="History"
        component={PaymentHistoryScreen}
        options={{
          tabBarLabel: 'Transaction History',
          tabBarIcon: HistoryTabIcon,
          title: 'Transaction History',
        }}
      />
      <Tab.Screen
        name="Requests"
        component={PaymentRequestsListScreen}
        options={{
          tabBarLabel: 'Payment Requests',
          tabBarIcon: RequestsTabIcon,
          title: 'Payment Requests',
        }}
      />
    </Tab.Navigator>
  );
};

export default PaymentsTabNavigator;
