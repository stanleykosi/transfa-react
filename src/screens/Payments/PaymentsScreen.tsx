/**
 * @description
 * Simplified Payments screen that ONLY shows transaction history.
 * No tabs - just the transaction history list.
 *
 * @dependencies
 * - react-native: For core components
 * - @/screens/Payments/PaymentHistoryScreen: The transaction history component
 * - @/components/ScreenWrapper: To provide a consistent safe area and background
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import PaymentHistoryScreen from '@/screens/Payments/PaymentHistoryScreen';
import { theme } from '@/constants/theme';

const PaymentsScreen = () => {
  return (
    <View style={styles.container}>
      <PaymentHistoryScreen
        showBack={false}
        title="Payments"
        subtitle="View all your payment transactions"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});

export default PaymentsScreen;
