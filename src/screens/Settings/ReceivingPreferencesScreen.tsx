import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useReceivingPreference, useUpdateReceivingPreference } from '@/api/transactionApi';
import { useListBeneficiaries } from '@/api/accountApi';
import theme from '@/constants/theme';

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const ReceivingPreferencesScreen = () => {
  const navigation = useNavigation();

  const { data: receivingPreference, isLoading: loadingPreference } = useReceivingPreference();
  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useListBeneficiaries();

  const updateMutation = useUpdateReceivingPreference({
    onError: (error) => {
      Alert.alert('Update failed', error.message || 'Unable to update receiving destination.');
    },
  });

  const selectedExternalBeneficiaryId = useMemo(() => {
    if (!receivingPreference?.use_external_account) {
      return null;
    }
    const preferredByPreferenceId = beneficiaries?.find(
      (item) => item.id === receivingPreference.default_beneficiary_id
    );
    if (preferredByPreferenceId) {
      return preferredByPreferenceId.id;
    }

    const legacyPreferred = beneficiaries?.find((item) => item.is_default);
    return legacyPreferred?.id || beneficiaries?.[0]?.id || null;
  }, [
    beneficiaries,
    receivingPreference?.default_beneficiary_id,
    receivingPreference?.use_external_account,
  ]);

  const selectInAppWallet = () => {
    updateMutation.mutate({ use_external_account: false });
  };

  const selectExternal = (beneficiaryId: string) => {
    updateMutation.mutate({
      use_external_account: true,
      default_beneficiary_id: beneficiaryId,
    });
  };

  const isLoading = loadingPreference || loadingBeneficiaries;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>Receiving Destination</Text>

          <View style={styles.noticeCard}>
            <Ionicons name="warning" size={18} color={BRAND_YELLOW} />
            <Text style={styles.noticeText}>
              Funds are received and stored in the destination account you select.
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.destinationRow,
                  !receivingPreference?.use_external_account && styles.destinationRowActive,
                ]}
                onPress={selectInAppWallet}
                disabled={updateMutation.isPending}
              >
                <Text style={styles.destinationTitle}>In-App Wallet</Text>
                <Radio checked={!receivingPreference?.use_external_account} />
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>External Account</Text>

              {(beneficiaries || []).map((beneficiary) => {
                const checked = Boolean(
                  receivingPreference?.use_external_account &&
                    selectedExternalBeneficiaryId === beneficiary.id
                );

                return (
                  <TouchableOpacity
                    key={beneficiary.id}
                    style={styles.externalCard}
                    onPress={() => selectExternal(beneficiary.id)}
                    disabled={updateMutation.isPending}
                  >
                    <View style={styles.externalTextWrap}>
                      <Text style={styles.externalName}>{beneficiary.account_name}</Text>
                      <Text style={styles.externalNumber}>{beneficiary.account_number_masked}</Text>
                      <Text style={styles.externalBank}>{beneficiary.bank_name}</Text>
                    </View>
                    <Radio checked={checked} />
                  </TouchableOpacity>
                );
              })}

              {(beneficiaries || []).length === 0 ? (
                <Text style={styles.emptyText}>
                  No linked external account yet. Link an account to use external destination.
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const Radio = ({ checked }: { checked: boolean }) => (
  <View style={[styles.radioOuter, checked && styles.radioOuterChecked]}>
    {checked ? <View style={styles.radioInner} /> : null}
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.s20,
    paddingBottom: spacing.s32,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 18,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: 20,
  },
  noticeCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  noticeText: {
    color: '#AEB1B7',
    fontSize: fontSizes.sm,
    lineHeight: 19,
    flex: 1,
  },
  loadingWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  destinationRow: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destinationRowActive: {
    borderColor: BRAND_YELLOW,
  },
  destinationTitle: {
    color: '#ECECEC',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 8,
    color: '#ECECEF',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  externalCard: {
    minHeight: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  externalTextWrap: {
    flex: 1,
  },
  externalName: {
    color: '#F0F0F1',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  externalNumber: {
    marginTop: 2,
    color: '#9A9DA3',
    fontSize: fontSizes.sm,
  },
  externalBank: {
    marginTop: 2,
    color: '#C7C9CD',
    fontSize: fontSizes.sm,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#A3A6AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterChecked: {
    borderColor: BRAND_YELLOW,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND_YELLOW,
  },
  emptyText: {
    color: '#A8ABB0',
    fontSize: fontSizes.sm,
    marginTop: 10,
  },
});

export default ReceivingPreferencesScreen;
