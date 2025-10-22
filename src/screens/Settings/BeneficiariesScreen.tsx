/**
 * @description
 * Enhanced Beneficiaries (Linked Accounts) screen with modern fintech UI.
 * Displays a list of the user's saved beneficiaries (linked external bank accounts).
 * Allows users to view their accounts, add new ones, and delete existing ones.
 *
 * Key features:
 * - Modern card-based layout with improved visual hierarchy
 * - Enhanced empty states with illustrations
 * - Smooth deletion with confirmation
 * - Professional styling consistent with fintech best practices
 *
 * @dependencies
 * - react-native: For UI components and `Alert` for confirmation
 * - @react-navigation/native: For navigation to other screens
 * - @/components/*: Reusable UI components
 * - @/api/accountApi: Hooks for listing and deleting beneficiaries
 * - @expo/vector-icons: For icons
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import ScreenWrapper from '@/components/ScreenWrapper';
import ActionButton from '@/components/ActionButton';
import { useListBeneficiaries, useDeleteBeneficiary } from '@/api/accountApi';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Beneficiary } from '@/types/api';

type BeneficiariesScreenNavigationProp = NativeStackNavigationProp<
  ProfileStackParamList,
  'Beneficiaries'
>;

const ItemSeparator = () => <View style={styles.separator} />;

const BeneficiaryItem = React.memo(
  ({ item, onDelete }: { item: Beneficiary; onDelete: (id: string) => void }) => {
    const handleDelete = () => {
      Alert.alert('Delete Beneficiary', `Are you sure you want to remove ${item.account_name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
      ]);
    };

    return (
      <View style={styles.itemContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="business" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.itemDetails}>
          <Text style={styles.accountName}>{item.account_name}</Text>
          <View style={styles.bankInfoRow}>
            <Ionicons name="briefcase-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.bankInfo}>{item.bank_name}</Text>
          </View>
          <View style={styles.bankInfoRow}>
            <Ionicons name="card-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.bankInfo}>{item.account_number_masked}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    );
  }
);

const BeneficiariesScreen = () => {
  const navigation = useNavigation<BeneficiariesScreenNavigationProp>();
  const { data: beneficiaries, isLoading, isError, error } = useListBeneficiaries();
  const { mutate: deleteBeneficiary, isPending: isDeleting } = useDeleteBeneficiary({
    onSuccess: () => {
      Alert.alert('Success', 'Beneficiary removed successfully.');
    },
    onError: (err) => {
      Alert.alert('Error', err.message || 'Failed to remove beneficiary.');
    },
  });

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="business-outline" size={72} color={theme.colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>No Linked Accounts</Text>
      <Text style={styles.emptySubtitle}>
        Link your external bank accounts to receive payments and transfer funds easily.
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.errorIconContainer}>
        <Ionicons name="alert-circle-outline" size={72} color={theme.colors.error} />
      </View>
      <Text style={styles.emptyTitle}>Failed to Load</Text>
      <Text style={styles.emptySubtitle}>
        {error?.message || 'Unable to load your linked accounts.'}
      </Text>
    </View>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading linked accounts...</Text>
        </View>
      );
    }

    if (isError) {
      return renderErrorState();
    }

    if (!beneficiaries || beneficiaries.length === 0) {
      return renderEmptyState();
    }

    return (
      <FlatList
        data={beneficiaries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BeneficiaryItem item={item} onDelete={deleteBeneficiary} />}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Linked Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Deleting Overlay */}
      {isDeleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.deletingText}>Removing...</Text>
        </View>
      )}

      {/* Content */}
      {renderContent()}

      {/* Add New Account Button */}
      <ActionButton
        title="Add New Account"
        icon="add-circle"
        onPress={() => navigation.navigate('AddBeneficiary')}
        variant="primary"
        size="large"
        style={styles.addButton}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s24,
  },
  backButton: {
    padding: theme.spacing.s4,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.s48,
  },
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  // Empty State
  emptyContainer: {
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
  errorIconContainer: {
    marginBottom: theme.spacing.s20,
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
  // List
  listContainer: {
    paddingBottom: 100, // Space for floating button
  },
  separator: {
    height: theme.spacing.s12,
  },
  // Beneficiary Item
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.lg,
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
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  itemDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s6,
  },
  bankInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s6,
    marginBottom: theme.spacing.s4,
  },
  bankInfo: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  deleteButton: {
    padding: theme.spacing.s8,
    marginLeft: theme.spacing.s8,
  },
  // Add Button
  addButton: {
    position: 'absolute',
    bottom: theme.spacing.s24,
    left: theme.spacing.s24,
    right: theme.spacing.s24,
  },
  // Deleting Overlay
  deletingOverlay: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s20,
    borderRadius: theme.radii.full,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
    gap: theme.spacing.s12,
  },
  deletingText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.medium,
  },
});

export default BeneficiariesScreen;
