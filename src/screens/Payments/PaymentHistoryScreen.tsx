/**
 * @description
 * Enhanced Transaction History screen with modern fintech UI.
 * Displays a list of all user transactions with improved visual hierarchy,
 * better status indicators, and smooth animations.
 *
 * @dependencies
 * - react, react-native: For UI components and state management
 * - @/api/transactionApi: For fetching transaction history
 * - @/utils/formatCurrency: For displaying currency values
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { theme } from '@/constants/theme';
import { useTransactionHistory } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { Ionicons } from '@expo/vector-icons';

interface TransactionItemProps {
  transaction: {
    id: string;
    type: string;
    category: string;
    status: string;
    amount: number;
    fee: number;
    description: string;
    created_at: string;
    sender_id: string;
    recipient_id?: string;
  };
  currentUserId: string;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, currentUserId }) => {
  const isOutgoing = transaction.sender_id === currentUserId;
  const isIncoming = transaction.recipient_id === currentUserId;

  const getTransactionIcon = () => {
    switch (transaction.type) {
      case 'p2p':
        return isOutgoing ? 'arrow-up-circle' : 'arrow-down-circle';
      case 'self_transfer':
        return 'swap-horizontal-outline';
      case 'subscription_fee':
        return 'card-outline';
      default:
        return 'flash-outline';
    }
  };

  const getTransactionColor = () => {
    switch (transaction.status) {
      case 'completed':
        return theme.colors.success;
      case 'pending':
        return theme.colors.warning;
      case 'failed':
        return theme.colors.error;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getIconBgColor = () => {
    if (isIncoming) {
      return '#D1FAE5'; // Green 100
    }
    if (isOutgoing) {
      return '#FEE2E2'; // Red 100
    }
    return theme.colors.primaryLight;
  };

  const getIconColor = () => {
    if (isIncoming) {
      return theme.colors.success;
    }
    if (isOutgoing) {
      return theme.colors.error;
    }
    return theme.colors.primary;
  };

  const getStatusText = () => {
    switch (transaction.status) {
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return transaction.status;
    }
  };

  const getTransactionTitle = () => {
    switch (transaction.type) {
      case 'p2p':
        return isOutgoing ? 'Sent to Contact' : 'Received from Contact';
      case 'self_transfer':
        return 'Withdrawal';
      case 'subscription_fee':
        return 'Service Fee';
      default:
        return transaction.type;
    }
  };

  const getAmountDisplay = () => {
    const amount = transaction.amount;
    const fee = transaction.fee || 0;
    const total = amount + fee;

    if (isOutgoing) {
      return `-${formatCurrency(total)}`;
    } else if (isIncoming) {
      return `+${formatCurrency(amount)}`;
    } else {
      return formatCurrency(amount);
    }
  };

  const getAmountColor = () => {
    if (isIncoming) {
      return theme.colors.success;
    }
    if (isOutgoing) {
      return theme.colors.error;
    }
    return theme.colors.textPrimary;
  };

  return (
    <View style={styles.transactionItem}>
      <View style={[styles.iconContainer, { backgroundColor: getIconBgColor() }]}>
        <Ionicons name={getTransactionIcon() as any} size={24} color={getIconColor()} />
      </View>

      <View style={styles.transactionContent}>
        <View style={styles.transactionHeader}>
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionTitle}>{getTransactionTitle()}</Text>
            <Text style={styles.transactionDescription} numberOfLines={1}>
              {transaction.description || 'No description'}
            </Text>
          </View>

          <View style={styles.amountContainer}>
            <Text style={[styles.amountText, { color: getAmountColor() }]}>
              {getAmountDisplay()}
            </Text>
            {transaction.fee > 0 && isOutgoing && (
              <Text style={styles.feeText}>Fee: {formatCurrency(transaction.fee)}</Text>
            )}
          </View>
        </View>

        <View style={styles.transactionFooter}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: getTransactionColor() }]} />
            <Text style={[styles.statusText, { color: getTransactionColor() }]}>
              {getStatusText()}
            </Text>
          </View>

          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={12} color={theme.colors.textSecondary} />
            <Text style={styles.dateText}>
              {new Date(transaction.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// Move separator component outside of render
const ItemSeparatorComponent = () => <View style={styles.separator} />;

const PaymentHistoryScreen = () => {
  const [refreshing, setRefreshing] = useState(false);

  const { data: transactions, isLoading, error, refetch } = useTransactionHistory();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (refreshError) {
      console.error('Error refreshing transactions:', refreshError);
      Alert.alert('Error', 'Failed to refresh transactions');
    } finally {
      setRefreshing(false);
    }
  };

  const renderTransaction = ({ item }: { item: any }) => (
    <TransactionItem
      transaction={item}
      currentUserId="current-user-id" // TODO: Get from auth context
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="receipt-outline" size={72} color={theme.colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>No Transactions Yet</Text>
      <Text style={styles.emptySubtitle}>
        Your transaction history will appear here once you start making payments or transfers.
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconContainer}>
        <Ionicons name="alert-circle-outline" size={72} color={theme.colors.error} />
      </View>
      <Text style={styles.errorTitle}>Failed to Load Transactions</Text>
      <Text style={styles.errorSubtitle}>
        {error?.message || 'Something went wrong while loading your transactions.'}
      </Text>
    </View>
  );

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  if (error && !transactions) {
    return renderErrorState();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions || []}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={ItemSeparatorComponent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.s16,
    paddingVertical: theme.spacing.s12,
  },
  // Transaction Item
  transactionItem: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  transactionContent: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s12,
  },
  transactionInfo: {
    flex: 1,
    marginRight: theme.spacing.s12,
  },
  transactionTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  transactionDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    marginBottom: theme.spacing.s2,
  },
  feeText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.s6,
  },
  statusText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s4,
  },
  dateText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  separator: {
    height: theme.spacing.s12,
  },
  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.s48,
    paddingHorizontal: theme.spacing.s32,
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
  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s32,
    backgroundColor: theme.colors.background,
  },
  errorIconContainer: {
    marginBottom: theme.spacing.s20,
  },
  errorTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default PaymentHistoryScreen;
