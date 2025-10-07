/**
 * @description
 * A dropdown component for selecting banks. This component provides a user-friendly
 * way to select a bank from a list of supported banks, displaying the bank name
 * while internally handling the bank code.
 *
 * @dependencies
 * - react-native: For core UI components.
 * - @/constants/theme: For consistent styling.
 * - @/types/api: For Bank type definition.
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
import { Bank } from '@/types/api';

interface BankDropdownProps {
  banks: Bank[];
  selectedBank: Bank | null;
  onSelectBank: (bank: Bank) => void;
  isLoading?: boolean;
  error?: string;
  placeholder?: string;
}

const BankDropdown: React.FC<BankDropdownProps> = ({
  banks,
  selectedBank,
  onSelectBank,
  isLoading = false,
  error,
  placeholder = 'Select a bank',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectBank = (bank: Bank) => {
    onSelectBank(bank);
    setIsOpen(false);
  };

  const renderBankItem = ({ item }: { item: Bank }) => (
    <TouchableOpacity style={styles.bankItem} onPress={() => handleSelectBank(item)}>
      <Text style={styles.bankName}>{item.attributes.name}</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.dropdown}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading banks...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.dropdown, styles.errorDropdown]}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.error} />
          <Text style={styles.errorText}>Failed to load banks</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.dropdown, isOpen && styles.dropdownOpen, error && styles.errorDropdown]}
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text style={[styles.dropdownText, !selectedBank && styles.placeholderText]}>
          {selectedBank ? selectedBank.attributes.name : placeholder}
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
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Bank</Text>
              <TouchableOpacity onPress={() => setIsOpen(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={banks}
              keyExtractor={(item) => item.id}
              renderItem={renderBankItem}
              style={styles.bankList}
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
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.s16,
    paddingVertical: theme.spacing.s16,
    minHeight: 48,
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
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginLeft: theme.spacing.s8,
    fontSize: theme.fontSizes.sm,
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
  bankList: {
    maxHeight: 300,
  },
  bankItem: {
    padding: theme.spacing.s16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  bankName: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
  },
});

export default BankDropdown;
