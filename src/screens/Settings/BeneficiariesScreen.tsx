/**
 * @description
 * This screen displays a list of the user's saved beneficiaries (linked external
 * bank accounts). It allows users to view their accounts, add new ones, and
 * delete existing ones.
 *
 * Key features:
 * - Fetches and displays a list of beneficiaries using `useListBeneficiaries`.
 * - Handles loading, empty, and error states for the beneficiary list.
 * - Provides a button to navigate to the "Add Beneficiary" screen.
 * - Allows users to delete a beneficiary with a confirmation prompt.
 *
 * @dependencies
 * - react-native: For UI components and `Alert` for confirmation.
 * - @react-navigation/native: For navigation to other screens.
 * - @/components/*: Reusable UI components.
 * - @/api/accountApi: Hooks for listing and deleting beneficiaries.
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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import { useListBeneficiaries, useDeleteBeneficiary } from '@/api/accountApi';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Beneficiary } from '@/types/api';

type BeneficiariesScreenNavigationProp = NativeStackNavigationProp<
  ProfileStackParamList,
  'Beneficiaries'
>;

// Move ItemSeparatorComponent outside of render to avoid unstable nested components warning
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
          <Ionicons name="business-outline" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.itemDetails}>
          <Text style={styles.accountName}>{item.account_name}</Text>
          <Text style={styles.bankInfo}>
            {item.bank_name} • {item.account_number_masked}
          </Text>
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

  const renderContent = () => {
    if (isLoading) {
      return (
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.centered} />
      );
    }
    if (isError) {
      return <Text style={styles.centered}>{error.message}</Text>;
    }
    if (!beneficiaries || beneficiaries.length === 0) {
      return <Text style={styles.centered}>You haven't added any linked accounts yet.</Text>;
    }
    return (
      <FlatList
        data={beneficiaries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BeneficiaryItem item={item} onDelete={deleteBeneficiary} />}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={{ paddingBottom: 100 }} // Space for floating button
      />
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Linked Accounts</Text>
        <View style={{ width: 24 }} />
      </View>
      {isDeleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.deletingText}>Removing...</Text>
        </View>
      )}
      {renderContent()}
      <PrimaryButton
        title="Add New Account"
        onPress={() => navigation.navigate('AddBeneficiary')}
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
    paddingBottom: theme.spacing.s24,
  },
  backButton: { padding: theme.spacing.s4 },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addButton: { position: 'absolute', bottom: theme.spacing.s32, left: 24, right: 24 },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.md,
  },
  iconContainer: {
    padding: theme.spacing.s12,
    backgroundColor: '#F0F2FF',
    borderRadius: theme.radii.full,
  },
  itemDetails: { flex: 1, marginLeft: theme.spacing.s16 },
  accountName: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  bankInfo: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
  },
  deleteButton: { padding: theme.spacing.s8 },
  separator: { height: theme.spacing.s12 },
  deletingOverlay: {
    position: 'absolute',
    top: 100,
    left: '35%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: theme.spacing.s8,
    borderRadius: theme.radii.md,
    zIndex: 10,
  },
  deletingText: { marginLeft: theme.spacing.s8, color: theme.colors.textSecondary },
});

export default BeneficiariesScreen;
