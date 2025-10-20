/**
 * @description
 * This file defines the top tab navigator for the "Payments" section of the app.
 * It provides two tabs: "History" for past transactions and "Requests" for
 * managing payment requests.
 *
 * @dependencies
 * - @react-navigation/material-top-tabs: For the tab navigator component.
 * - Screens: Imports the PaymentHistoryScreen and PaymentRequestsListScreen.
 * - @/constants/theme: For consistent styling of the tab bar.
 */
import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import PaymentHistoryScreen from '@/screens/Payments/PaymentHistoryScreen';
import PaymentRequestsListScreen from '@/screens/PaymentRequests/PaymentRequestsListScreen';
import { theme } from '@/constants/theme';

export type PaymentsTabParamList = {
  History: undefined;
  Requests: undefined;
};

const Tab = createMaterialTopTabNavigator<PaymentsTabParamList>();

const PaymentsTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarIndicatorStyle: {
          backgroundColor: theme.colors.primary,
          height: 3,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 1,
          shadowOpacity: 0.1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowRadius: 2,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
          textTransform: 'capitalize',
          margin: 0,
          padding: 0,
        },
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="History"
        component={PaymentHistoryScreen}
        options={{
          tabBarLabel: 'Transaction History',
          title: 'Transaction History',
        }}
      />
      <Tab.Screen
        name="Requests"
        component={PaymentRequestsListScreen}
        options={{
          tabBarLabel: 'Payment Requests',
          title: 'Payment Requests',
        }}
      />
    </Tab.Navigator>
  );
};

export default PaymentsTabNavigator;
