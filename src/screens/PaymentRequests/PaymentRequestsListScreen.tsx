/**
 * @description
 * This screen displays a list of payment requests created by the user.
 * It shows the status of each request ('Pending' or 'Fulfilled') and allows
 * the user to navigate to a screen to create a new request.
 *
 * @dependencies
 * - react, react-native: For UI components and hooks.
 * - @react-navigation/native: For navigation.
 * - @/components/*: Reusable UI components.
 * - @/api/transactionApi: For the `useListPaymentRequests` hook.
 * - @/utils/formatCurrency: For formatting amounts.
 * - @expo/vector-icons: For icons.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '@/navigation/AppStack';
import { useListPaymentRequests } from '@/api/transactionApi';
import { PaymentRequest } from '@/types/api';
import { theme } from '@/constants/theme';
import { formatCurrency } from '@/utils/formatCurrency';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '@/components/PrimaryButton';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const PaymentRequestItem = React.memo(({ item }: { item: PaymentRequest }) => {
  const statusStyles =
    item.status === 'fulfilled' ? styles.statusFulfilled : styles.statusPending;

  return (
    <TouchableOpacity style={styles.itemContainer}>
      <View style={styles.itemIcon}>
        <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
      </View>
      <View style={styles.itemDetails}>
        <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
        <Text style={styles.itemDescription} numberOfLines={1}>
          {item.description || 'No description'}
        </Text>
      </View>
      <View style={[styles.statusBadge, statusStyles.badge]}>
        <Text style={statusStyles.text}>{item.status}</Text>
      </View>
    </TouchableOpacity>
  );
});

const ItemSeparator = () => <View style={styles.separator} />;

const PaymentRequestsListScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { data: requests, isLoading, isError, error } = useListPaymentRequests();

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
        </View>
      );
    }

    if (!requests || requests.length === 0) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.emptyText}>You haven't created any payment requests yet.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PaymentRequestItem item={item} />}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={styles.listContainer}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderContent()}
      <PrimaryButton
        title="Create New Request"
        onPress={() => navigation.navigate('CreatePaymentRequest')}
        style={styles.createButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s24,
  },
  listContainer: {
    padding: theme.spacing.s16,
    paddingBottom: 100, // Space for the create button
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.base,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.base,
    textAlign: 'center',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.lg,
  },
  itemIcon: {
    backgroundColor: '#F0F2FF',
    padding: theme.spacing.s12,
    borderRadius: theme.radii.full,
  },
  itemDetails: {
    flex: 1,
    marginLeft: theme.spacing.s16,
  },
  itemAmount: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  itemDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.s12,
    paddingVertical: theme.spacing.s4,
    borderRadius: theme.radii.full,
  },
  statusPending: {
    badge: {
      backgroundColor: '#FEF3C7', // Amber 100
    },
    text: {
      color: '#B45309', // Amber 700
      fontSize: theme.fontSizes.xs,
      fontWeight: theme.fontWeights.medium,
      textTransform: 'capitalize',
    },
  },
  statusFulfilled: {
    badge: {
      backgroundColor: '#D1FAE5', // Green 100
    },
    text: {
      color: '#065F46', // Green 800
      fontSize: theme.fontSizes.xs,
      fontWeight: theme.fontWeights.medium,
      textTransform: 'capitalize',
    },
  },
  separator: {
    height: theme.spacing.s12,
  },
  createButton: {
    position: 'absolute',
    bottom: theme.spacing.s16,
    left: theme.spacing.s16,
    right: theme.spacing.s16,
  },
});

export default PaymentRequestsListScreen;
