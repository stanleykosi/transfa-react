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
import { Text } from 'react-native';

export type PaymentsTabParamList = {
  History: undefined;
  Requests: undefined;
};

const Tab = createMaterialTopTabNavigator<PaymentsTabParamList>();

const PaymentsTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarIndicatorStyle: {
          backgroundColor: theme.colors.primary,
        },
        tabBarLabelStyle: {
          fontWeight: theme.fontWeights.semibold,
          fontSize: 13,
          margin: 0,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          elevation: 0,
          shadowOpacity: 0,
          height: 48,
        },
        tabBarLabel: ({ focused, color }) => {
          const label = route.name === 'History' ? 'Transaction History' : 'Payment Requests';
          return (
            <Text style={{
              color: focused ? theme.colors.primary : theme.colors.textSecondary,
              fontSize: 13,
              fontWeight: '600',
              textTransform: 'capitalize',
            }}>
              {label}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen name="History" component={PaymentHistoryScreen} />
      <Tab.Screen name="Requests" component={PaymentRequestsListScreen} />
    </Tab.Navigator>
  );
};

export default PaymentsTabNavigator;
