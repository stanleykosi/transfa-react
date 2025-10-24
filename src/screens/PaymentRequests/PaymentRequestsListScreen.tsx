/**
 * @description
 * Enhanced Payment Requests List screen with modern fintech UI.
 * Displays a list of payment requests created by the user with improved visual hierarchy.
 * Includes a button at the bottom to navigate to create a new payment request.
 *
 * @dependencies
 * - react, react-native: For UI components and hooks
 * - @/components/*: Reusable UI components
 * - @/api/transactionApi: For the `useListPaymentRequests` hook
 * - @/utils/formatCurrency: For formatting amounts
 * - @expo/vector-icons: For icons
 * - @react-navigation/native: For navigation
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useListPaymentRequests } from '@/api/transactionApi';
import { PaymentRequest } from '@/types/api';
import { theme } from '@/constants/theme';
import { formatCurrency } from '@/utils/formatCurrency';
import { Ionicons } from '@expo/vector-icons';
import ActionButton from '@/components/ActionButton';
import AppHeader from '@/components/AppHeader';

const PaymentRequestItem = React.memo(({ item }: { item: PaymentRequest }) => {
  const isFulfilled = item.status === 'fulfilled';
  const isPending = item.status === 'pending';

  const getStatusColor = () => {
    if (isFulfilled) {
      return theme.colors.success;
    }
    if (isPending) {
      return theme.colors.warning;
    }
    return theme.colors.textSecondary;
  };

  const getStatusBgColor = () => {
    if (isFulfilled) {
      return '#D1FAE5'; // Green 100
    }
    if (isPending) {
      return '#FEF3C7'; // Amber 100
    }
    return '#F3F4F6'; // Gray 100
  };

  const getStatusIcon = () => {
    if (isFulfilled) {
      return 'checkmark-circle';
    }
    if (isPending) {
      return 'time';
    }
    return 'alert-circle';
  };

  return (
    <TouchableOpacity activeOpacity={0.8}>
      <View style={styles.itemContainer}>
        <View style={[styles.itemIconContainer, { backgroundColor: theme.colors.primaryLight }]}>
          <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor() }]}>
              <Ionicons name={getStatusIcon()} size={14} color={getStatusColor()} />
              <Text style={[styles.statusText, { color: getStatusColor() }]}>{item.status}</Text>
            </View>
          </View>

          <Text style={styles.itemDescription} numberOfLines={2}>
            {item.description || 'No description provided'}
          </Text>

          <View style={styles.itemFooter}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.itemDate}>
              {new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const ItemSeparator = () => <View style={styles.separator} />;

const PaymentRequestsListScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const { data: requests, isLoading, isError, error, refetch } = useListPaymentRequests();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (refreshError) {
      console.error('Error refreshing payment requests:', refreshError);
    } finally {
      setRefreshing(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="document-text-outline" size={72} color={theme.colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>No Payment Requests</Text>
      <Text style={styles.emptySubtitle}>
        You haven't created any payment requests yet.{'\n'}
        Create one from the Home screen to get started.
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="alert-circle-outline" size={72} color={theme.colors.error} />
      </View>
      <Text style={styles.emptyTitle}>Failed to Load</Text>
      <Text style={styles.emptySubtitle}>
        {error?.message || 'Something went wrong while loading your payment requests.'}
      </Text>
    </View>
  );

  const renderContent = () => {
    if (isLoading && !refreshing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading payment requests...</Text>
        </View>
      );
    }

    if (isError) {
      return renderErrorState();
    }

    if (!requests || requests.length === 0) {
      return renderEmptyState();
    }

    return (
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PaymentRequestItem item={item} />}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Payment Requests"
        subtitle="Manage your outstanding requests"
        icon="document-text"
        showBack
      />

      <View style={styles.contentWrapper}>
        {renderContent()}

        <View style={styles.inlineButtonContainer}>
          <ActionButton
            title="Create New Payment"
            variant="primary"
            size="medium"
            onPress={() => navigation.navigate('CreatePaymentRequest' as never)}
            style={styles.createButton}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: theme.spacing.s16,
    paddingVertical: theme.spacing.s16,
    gap: theme.spacing.s16,
  },
  listContainer: {
    paddingBottom: theme.spacing.s16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s24,
  },
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s32,
  },
  emptyIconContainer: {
    marginBottom: theme.spacing.s20,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Item Styles
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s8,
  },
  itemAmount: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s12,
    paddingVertical: theme.spacing.s4,
    borderRadius: theme.radii.full,
    gap: theme.spacing.s4,
  },
  statusText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.semibold,
    textTransform: 'capitalize',
  },
  itemDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s8,
    lineHeight: 18,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s4,
  },
  itemDate: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  separator: {
    height: theme.spacing.s12,
  },
  inlineButtonContainer: {
    paddingTop: theme.spacing.s16,
    paddingBottom: theme.spacing.s24,
  },
  createButton: {
    width: '100%',
  },
});

export default PaymentRequestsListScreen;
