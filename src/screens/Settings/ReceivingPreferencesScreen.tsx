/**
 * @description
 * This screen allows users to manage their receiving preferences for incoming transfers.
 * Users can toggle between receiving transfers to their internal wallet or external account,
 * and set their default beneficiary account (for subscribed users).
 *
 * Key features:
 * - Toggle between internal wallet and external account for receiving transfers
 * - Set default beneficiary account (for subscribed users with multiple accounts)
 * - Display current receiving preference status
 * - Handle subscription-based logic (non-subscribed users auto-use single external account)
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components.
 * - @/api/transactionApi: For receiving preference and default beneficiary management.
 * - @/api/accountApi: For listing beneficiaries.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useReceivingPreference, useUpdateReceivingPreference } from '@/api/transactionApi';
import { useDefaultBeneficiary, useSetDefaultBeneficiary } from '@/api/transactionApi';
import { useListBeneficiaries } from '@/api/accountApi';
import { Beneficiary } from '@/types/api';
import BeneficiaryDropdown from '@/components/BeneficiaryDropdown';

const ReceivingPreferencesScreen = () => {
  const navigation = useNavigation();
  const [useExternalAccount, setUseExternalAccount] = useState(false);
  const [selectedDefaultBeneficiary, setSelectedDefaultBeneficiary] = useState<Beneficiary | null>(
    null
  );

  // Fetch current preferences and beneficiaries
  const { data: receivingPreference, isLoading: isLoadingPreference } = useReceivingPreference();
  const { data: defaultBeneficiary, isLoading: isLoadingDefault } = useDefaultBeneficiary();
  const { data: beneficiaries, isLoading: isLoadingBeneficiaries } = useListBeneficiaries();

  // Mutations for updating preferences
  const { mutate: updateReceivingPreference, isPending: isUpdatingPreference } =
    useUpdateReceivingPreference({
      onSuccess: () => {
        Alert.alert('Success', 'Receiving preference updated successfully');
      },
      onError: (error) => {
        Alert.alert('Error', error.message || 'Failed to update receiving preference');
      },
    });

  const { mutate: setDefaultBeneficiary, isPending: isSettingDefault } = useSetDefaultBeneficiary({
    onSuccess: () => {
      Alert.alert('Success', 'Default beneficiary updated successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to set default beneficiary');
    },
  });

  // Update local state when data is fetched
  useEffect(() => {
    if (receivingPreference) {
      setUseExternalAccount(receivingPreference.use_external_account);
    }
  }, [receivingPreference]);

  useEffect(() => {
    if (defaultBeneficiary) {
      setSelectedDefaultBeneficiary(defaultBeneficiary);
    }
  }, [defaultBeneficiary]);

  const handleToggleReceivingPreference = (value: boolean) => {
    setUseExternalAccount(value);

    // If switching to external account and no default beneficiary is set,
    // and user has beneficiaries, set the first one as default
    if (value && !selectedDefaultBeneficiary && beneficiaries && beneficiaries.length > 0) {
      const firstBeneficiary = beneficiaries[0];
      setSelectedDefaultBeneficiary(firstBeneficiary);
      updateReceivingPreference({
        use_external_account: value,
        default_beneficiary_id: firstBeneficiary.id,
      });
    } else {
      updateReceivingPreference({
        use_external_account: value,
        default_beneficiary_id: value ? selectedDefaultBeneficiary?.id : undefined,
      });
    }
  };

  const handleSetDefaultBeneficiary = (beneficiary: Beneficiary) => {
    setSelectedDefaultBeneficiary(beneficiary);
    setDefaultBeneficiary({ beneficiary_id: beneficiary.id });
  };

  const isLoading = isLoadingPreference || isLoadingDefault || isLoadingBeneficiaries;
  const isSubscribed = beneficiaries && beneficiaries.length > 1; // Simple logic: multiple accounts = subscribed

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Receiving Preferences</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading preferences...</Text>
          </View>
        ) : (
          <>
            {/* Receiving Account Toggle */}
            <View style={styles.preferenceCard}>
              <View style={styles.preferenceHeader}>
                <View style={styles.preferenceIcon}>
                  <Ionicons name="wallet-outline" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles.preferenceContent}>
                  <Text style={styles.preferenceTitle}>Receiving Account</Text>
                  <Text style={styles.preferenceDescription}>
                    Choose where incoming transfers should be received
                  </Text>
                </View>
              </View>

              <View style={styles.toggleContainer}>
                <View style={styles.toggleOption}>
                  <Text
                    style={[styles.toggleLabel, !useExternalAccount && styles.activeToggleLabel]}
                  >
                    Internal Wallet
                  </Text>
                  <Text style={styles.toggleDescription}>
                    Receive transfers in your Transfa wallet
                  </Text>
                </View>

                <Switch
                  value={useExternalAccount}
                  onValueChange={handleToggleReceivingPreference}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor={
                    useExternalAccount ? theme.colors.textOnPrimary : theme.colors.textSecondary
                  }
                  disabled={isUpdatingPreference}
                />

                <View style={styles.toggleOption}>
                  <Text
                    style={[styles.toggleLabel, useExternalAccount && styles.activeToggleLabel]}
                  >
                    External Account
                  </Text>
                  <Text style={styles.toggleDescription}>
                    Receive transfers directly to your bank account
                  </Text>
                </View>
              </View>
            </View>

            {/* Default Beneficiary Selection (for subscribed users) */}
            {useExternalAccount && (
              <View style={styles.preferenceCard}>
                <View style={styles.preferenceHeader}>
                  <View style={styles.preferenceIcon}>
                    <Ionicons name="business-outline" size={24} color={theme.colors.primary} />
                  </View>
                  <View style={styles.preferenceContent}>
                    <Text style={styles.preferenceTitle}>Default External Account</Text>
                    <Text style={styles.preferenceDescription}>
                      {isSubscribed
                        ? 'Select which external account to use for incoming transfers'
                        : 'Your single external account will be used automatically'}
                    </Text>
                  </View>
                </View>

                {isSubscribed ? (
                  <BeneficiaryDropdown
                    beneficiaries={beneficiaries || []}
                    selectedBeneficiary={selectedDefaultBeneficiary}
                    onSelectBeneficiary={handleSetDefaultBeneficiary}
                    isLoading={isSettingDefault}
                    placeholder="Select default account"
                  />
                ) : (
                  <View style={styles.singleAccountInfo}>
                    <Text style={styles.singleAccountText}>
                      {selectedDefaultBeneficiary
                        ? `${selectedDefaultBeneficiary.account_name} (${selectedDefaultBeneficiary.bank_name})`
                        : 'No external account linked'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Current Status */}
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>Current Setup</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Receiving transfers to:</Text>
                <Text style={styles.statusValue}>
                  {useExternalAccount
                    ? selectedDefaultBeneficiary
                      ? `${selectedDefaultBeneficiary.account_name} (${selectedDefaultBeneficiary.bank_name})`
                      : 'External account (not set)'
                    : 'Internal Transfa wallet'}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Account type:</Text>
                <Text style={styles.statusValue}>
                  {isSubscribed ? 'Subscribed (multiple accounts)' : 'Free (single account)'}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
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
  container: {
    flexGrow: 1,
    paddingTop: theme.spacing.s16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  preferenceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  preferenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.s16,
  },
  preferenceIcon: {
    backgroundColor: '#F0F2FF',
    padding: theme.spacing.s8,
    borderRadius: theme.radii.full,
    marginRight: theme.spacing.s12,
  },
  preferenceContent: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  preferenceDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s4,
  },
  activeToggleLabel: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
  toggleDescription: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  singleAccountInfo: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  singleAccountText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    marginTop: theme.spacing.s8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.s8,
  },
  statusLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  statusValue: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.medium,
    flex: 1,
    textAlign: 'right',
  },
});

export default ReceivingPreferencesScreen;
