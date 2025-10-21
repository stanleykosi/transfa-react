/**
 * @description
 * Transaction History screen within the Payments section.
 * Displays a list of all user transactions with their status, amount, and details.
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @/api/transactionApi: For fetching transaction history.
 * - @/utils/formatCurrency: For displaying currency values.
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
        return isOutgoing ? 'arrow-up' : 'arrow-down';
      case 'self_transfer':
        return 'arrow-forward';
      case 'subscription_fee':
        return 'card';
      default:
        return 'swap-horizontal';
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
    if (isIncoming) return theme.colors.success;
    if (isOutgoing) return theme.colors.error;
    return theme.colors.textPrimary;
  };

  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <View style={styles.transactionIcon}>
          <Ionicons
            name={getTransactionIcon() as any}
            size={20}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionType}>
            {transaction.type === 'p2p' ? 'P2P Transfer' :
              transaction.type === 'self_transfer' ? 'Withdrawal' :
                transaction.type === 'subscription_fee' ? 'Fee' :
                  transaction.type}
          </Text>
          <Text style={styles.transactionDescription} numberOfLines={1}>
            {transaction.description || 'No description'}
          </Text>
        </View>
        <View style={styles.transactionAmount}>
          <Text style={[styles.amountText, { color: getAmountColor() }]}>
            {getAmountDisplay()}
          </Text>
          {transaction.fee > 0 && (
            <Text style={styles.feeText}>
              Fee: {formatCurrency(transaction.fee)}
            </Text>
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
  );
};

const PaymentHistoryScreen = () => {
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: transactions,
    isLoading,
    error,
    refetch,
  } = useTransactionHistory();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error('Error refreshing transactions:', error);
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
      <Ionicons name="receipt-outline" size={64} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Transactions Yet</Text>
      <Text style={styles.emptySubtitle}>
        Your transaction history will appear here once you start making payments.
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

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
        <Text style={styles.errorTitle}>Failed to Load Transactions</Text>
        <Text style={styles.errorSubtitle}>
          {error.message || 'Something went wrong while loading your transactions.'}
        </Text>
      </View>
    );
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
    paddingVertical: theme.spacing.s8,
  },
  transactionItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.s16,
    marginVertical: theme.spacing.s8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s8,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  transactionInfo: {
    flex: 1,
    marginRight: theme.spacing.s12,
  },
  transactionType: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  transactionDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
  },
  feeText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s2,
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
    marginRight: theme.spacing.s8,
  },
  statusText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  dateText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.s32,
  },
  emptyTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s16,
    marginBottom: theme.spacing.s8,
  },
  emptySubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.s32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s32,
  },
  errorTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s16,
    marginBottom: theme.spacing.s8,
  },
  errorSubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

export default PaymentHistoryScreen;
