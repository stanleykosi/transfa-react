/**
 * @description
 * A dropdown component for selecting a beneficiary (a user's linked external account).
 * This component provides a user-friendly way to select a destination for transfers.
 *
 * @dependencies
 * - react, react-native: For core UI and state management.
 * - @expo/vector-icons: For UI icons.
 * - @/constants/theme: For consistent styling.
 * - @/types/api: For the Beneficiary type definition.
 *
 * @props
 * - beneficiaries (Beneficiary[]): The list of beneficiaries to display.
 * - selectedBeneficiary (Beneficiary | null): The currently selected beneficiary.
 * - onSelectBeneficiary ((beneficiary: Beneficiary) => void): Callback when a beneficiary is selected.
 * - isLoading (boolean, optional): If true, shows a loading state.
 * - error (string, optional): An error message to display if loading fails.
 * - placeholder (string, optional): The placeholder text to show when no beneficiary is selected.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Beneficiary } from '@/types/api';

interface BeneficiaryDropdownProps {
  beneficiaries: Beneficiary[];
  selectedBeneficiary: Beneficiary | null;
  onSelectBeneficiary: (beneficiary: Beneficiary) => void;
  isLoading?: boolean;
  error?: string;
  placeholder?: string;
}

const BeneficiaryDropdown: React.FC<BeneficiaryDropdownProps> = ({
  beneficiaries,
  selectedBeneficiary,
  onSelectBeneficiary,
  isLoading = false,
  error,
  placeholder = 'Select a destination account',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (beneficiary: Beneficiary) => {
    onSelectBeneficiary(beneficiary);
    setIsOpen(false);
  };

  const renderItem = ({ item }: { item: Beneficiary }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.account_name} from ${item.bank_name}`}
    >
      <View style={styles.itemIcon}>
        <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemName}>{item.account_name}</Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemDetails}>
          {item.bank_name} • {item.account_number_masked}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.dropdown}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.dropdown, styles.errorDropdown]}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.error} />
          <Text style={styles.errorText}>Failed to load accounts</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.dropdown, isOpen && styles.dropdownOpen]}
        onPress={() => setIsOpen(!isOpen)}
        disabled={beneficiaries.length === 0}
        accessibilityRole="button"
        accessibilityLabel={
          selectedBeneficiary ? `Selected: ${selectedBeneficiary.account_name}` : placeholder
        }
        accessibilityHint="Tap to select a different account"
      >
        <Text style={[styles.dropdownText, !selectedBeneficiary && styles.placeholderText]}>
          {selectedBeneficiary
            ? `${selectedBeneficiary.account_name} (${selectedBeneficiary.bank_name})`
            : beneficiaries.length > 0
              ? placeholder
              : 'No linked accounts found'}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        accessibilityViewIsModal
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Destination</Text>
              <TouchableOpacity
                onPress={() => setIsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close modal"
              >
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={beneficiaries}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.s16,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.s16,
    paddingVertical: theme.spacing.s12,
    minHeight: 50,
  },
  dropdownOpen: {
    borderColor: theme.colors.primary,
  },
  errorDropdown: {
    borderColor: theme.colors.error,
  },
  dropdownText: {
    flex: 1,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
  },
  loadingText: {
    marginLeft: theme.spacing.s8,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginLeft: theme.spacing.s8,
    color: theme.colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    width: '90%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.s16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  list: {
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.s16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemIcon: {
    backgroundColor: '#F0F2FF',
    padding: theme.spacing.s8,
    borderRadius: theme.radii.full,
    marginRight: theme.spacing.s12,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  defaultBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.s8,
    paddingVertical: theme.spacing.s2,
    borderRadius: theme.radii.sm,
    marginLeft: theme.spacing.s8,
  },
  defaultBadgeText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textOnPrimary,
    fontWeight: theme.fontWeights.semibold,
  },
  itemDetails: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});

export default BeneficiaryDropdown;
