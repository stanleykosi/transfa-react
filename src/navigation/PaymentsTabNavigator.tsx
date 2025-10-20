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
        },
        tabBarLabelStyle: {
          fontWeight: theme.fontWeights.semibold,
          textTransform: 'capitalize',
        },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          elevation: 0, // Remove shadow on Android
          shadowOpacity: 0, // Remove shadow on iOS
        },
      }}
    >
      <Tab.Screen name="History" component={PaymentHistoryScreen} />
      <Tab.Screen name="Requests" component={PaymentRequestsListScreen} />
    </Tab.Navigator>
  );
};

export default PaymentsTabNavigator;
