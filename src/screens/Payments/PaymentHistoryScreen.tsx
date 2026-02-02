/**
 * @description
 * Enhanced Transaction History screen with CORRECT transaction direction logic.
 * Properly distinguishes between incoming transfers, outgoing transfers, and withdrawals.
 *
 * @dependencies
 * - react, react-native: For UI components and state management
 * - @/api/transactionApi: For fetching transaction history
 * - @/utils/formatCurrency: For displaying currency values
 * - @clerk/clerk-expo: For getting current user ID
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
  TouchableOpacity,
} from 'react-native';
import { theme } from '@/constants/theme';
import { useTransactionHistory, useUserProfile } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '@/components/ScreenWrapper';
import { useNavigation } from '@react-navigation/native';

interface PaymentHistoryScreenProps {
  showBack?: boolean;
  title?: string;
}

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
  // CORRECT LOGIC: Check if current user is the sender or recipient
  const isSelfTransfer =
    transaction.type === 'self_transfer' ||
    transaction.type === 'self' ||
    transaction.category === 'self';
  const isP2P = transaction.type === 'p2p' || transaction.category === 'p2p';
  const isPlatformFee =
    transaction.type === 'platform_fee' || transaction.category === 'platform_fee';

  // For P2P transactions, check if user is sender or recipient
  const isOutgoing = (isP2P && transaction.sender_id === currentUserId) || isPlatformFee;
  const isIncoming =
    isP2P &&
    transaction.recipient_id === currentUserId &&
    transaction.recipient_id !== transaction.sender_id;

  const getTransactionIcon = () => {
    if (isSelfTransfer) {
      return 'swap-horizontal';
    }
    if (isPlatformFee) {
      return 'pricetag';
    }
    if (isOutgoing) {
      return 'arrow-up';
    }
    if (isIncoming) {
      return 'arrow-down';
    }
    return 'swap-horizontal';
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
    if (isOutgoing || isSelfTransfer) {
      return '#FEE2E2'; // Red 100
    }
    return theme.colors.primaryLight;
  };

  const getIconColor = () => {
    if (isIncoming) {
      return theme.colors.success;
    }
    if (isOutgoing || isSelfTransfer) {
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
    if (isSelfTransfer) {
      return 'Withdrawal to Bank';
    }
    if (isPlatformFee) {
      return 'Platform Fee';
    }
    if (isOutgoing) {
      return 'Payment Sent';
    }
    if (isIncoming) {
      return 'Payment Received';
    }
    return 'Transaction';
  };

  const getAmountDisplay = () => {
    const amount = transaction.amount;
    const fee = transaction.fee || 0;
    const total = amount + fee;

    if (isIncoming) {
      // For incoming payments, show positive amount (no fee deducted)
      return `+${formatCurrency(amount)}`;
    } else {
      // For outgoing and self transfers, show negative amount with fee
      return `-${formatCurrency(total)}`;
    }
  };

  const getAmountColor = () => {
    if (isIncoming) {
      return theme.colors.success;
    }
    return theme.colors.error;
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
            {transaction.fee > 0 && (isOutgoing || isSelfTransfer) && (
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

const PaymentHistoryScreen: React.FC<PaymentHistoryScreenProps> = ({
  showBack = true,
  title = 'Payments',
}) => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  // Get user profile with UUID for correct transaction direction logic
  const { data: userProfile, isLoading: isLoadingProfile } = useUserProfile();
  const { data: transactions, isLoading, error, refetch } = useTransactionHistory();

  // Get the current user's UUID from backend (not Clerk ID)
  const currentUserId = userProfile?.id || '';

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
      currentUserId={currentUserId} // Pass user UUID from backend
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

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.contentWrapper}>
        {(isLoading || isLoadingProfile) && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </View>
        ) : error && !transactions ? (
          renderErrorState()
        ) : (
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
        )}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.s24,
  },
  backButton: {
    padding: theme.spacing.s4,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  contentWrapper: {
    flex: 1,
    paddingTop: theme.spacing.s16,
    paddingBottom: 0,
    marginBottom: 0,
  },
  listContainer: {
    flexGrow: 1,
    paddingTop: theme.spacing.s12,
    paddingBottom: 0,
    marginBottom: 0,
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
    marginBottom: theme.spacing.s4,
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
    marginRight: theme.spacing.s8,
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
