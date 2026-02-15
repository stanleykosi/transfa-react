/**
 * @description
 * Enhanced Security Settings screen with modern fintech UI.
 * Provides the UI for users to manage their security settings,
 * specifically setting up or changing their 4-digit transaction PIN.
 *
 * Key features:
 * - Modern card-based layout with improved visual hierarchy
 * - Biometric authentication toggle
 * - PIN status indicators
 * - Professional styling consistent with fintech best practices
 *
 * @dependencies
 * - react, react-native: For UI and state management
 * - @/components/*: Reusable UI components
 * - @/store/useSecurityStore: Zustand store for PIN state and actions
 * - @react-navigation/native: For navigation actions
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Switch, TouchableOpacity } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import EnhancedCard from '@/components/EnhancedCard';
import FormInput from '@/components/FormInput';
import ActionButton from '@/components/ActionButton';
import { theme } from '@/constants/theme';
import { useSecurityStore } from '@/store/useSecurityStore';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { submitTransactionPinSetup } from '@/api/authApi';

const SecuritySettingsScreen = () => {
  const navigation = useNavigation();
  const { isPinSet, biometricsEnabled, setPin, clearPin, setBiometricsEnabled } =
    useSecurityStore();
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSetPin = async () => {
    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Your PIN must be 4 digits long.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('PINs Do Not Match', 'Please ensure both PINs are the same.');
      return;
    }

    setIsLoading(true);
    try {
      await submitTransactionPinSetup({ pin });
      try {
        await setPin(pin);
      } catch (localError) {
        console.warn('Failed to persist local PIN cache after backend setup', localError);
      }
      Alert.alert('Success', 'Your new transaction PIN has been set successfully.');
      setPinValue('');
      setConfirmPin('');
    } catch (error) {
      console.error('Failed to set PIN:', error);
      Alert.alert('Error', 'Could not set your PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearPin = () => {
    Alert.alert(
      'Clear PIN',
      'Are you sure you want to remove your PIN? You will need to set a new one to authorize transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Clear It',
          style: 'destructive',
          onPress: async () => {
            await clearPin();
            Alert.alert('Success', 'Your PIN has been cleared.');
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Security</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* PIN Status Card */}
        <EnhancedCard variant="elevated" style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusIconContainer,
                { backgroundColor: isPinSet ? '#D1FAE5' : '#FEE2E2' },
              ]}
            >
              <Ionicons
                name={isPinSet ? 'shield-checkmark' : 'shield-outline'}
                size={24}
                color={isPinSet ? theme.colors.success : theme.colors.error}
              />
            </View>
            <View style={styles.statusContent}>
              <Text style={styles.statusLabel}>Transaction PIN</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isPinSet ? theme.colors.success : theme.colors.error },
                ]}
              >
                {isPinSet ? '✓ Active & Secure' : '⚠ Not Set'}
              </Text>
            </View>
          </View>
          {!isPinSet && (
            <View style={styles.warningBanner}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.warning} />
              <Text style={styles.warningText}>Set up a PIN to secure your transactions</Text>
            </View>
          )}
        </EnhancedCard>

        {/* Biometric Authentication Card */}
        <EnhancedCard variant="default">
          <View style={styles.biometricRow}>
            <View style={styles.biometricIconContainer}>
              <Ionicons name="finger-print" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.biometricContent}>
              <Text style={styles.biometricTitle}>Biometric Authentication</Text>
              <Text style={styles.biometricSubtitle}>
                Use Face ID, Touch ID, or fingerprint for quick authentication
              </Text>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={biometricsEnabled ? theme.colors.surface : theme.colors.textSecondary}
            />
          </View>
        </EnhancedCard>

        {/* PIN Setup Section */}
        <Text style={styles.sectionTitle}>
          {isPinSet ? '🔄 Change Your PIN' : '🔐 Set Up Your PIN'}
        </Text>
        <Text style={styles.sectionSubtitle}>
          This 4-digit PIN will be used to authorize all your transactions and keep your account
          secure.
        </Text>

        <EnhancedCard variant="default">
          <FormInput
            label="New 4-Digit PIN"
            value={pin}
            onChangeText={setPinValue}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
          />
          <View style={styles.inputSpacer} />
          <FormInput
            label="Confirm New PIN"
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
          />
        </EnhancedCard>

        <ActionButton
          title={isPinSet ? 'Update PIN' : 'Set PIN'}
          icon="checkmark-circle"
          onPress={handleSetPin}
          loading={isLoading}
          variant="primary"
          size="large"
          style={styles.setPinButton}
        />

        {isPinSet && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearPin}>
            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            <Text style={styles.clearButtonText}>Clear Existing PIN</Text>
          </TouchableOpacity>
        )}

        {/* Security Tips */}
        <EnhancedCard variant="outlined" style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={20} color={theme.colors.accent} />
            <Text style={styles.tipsTitle}>Security Tips</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Use a unique PIN that you don't use elsewhere</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Avoid using obvious numbers like 1234 or your birthday
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Never share your PIN with anyone</Text>
          </View>
        </EnhancedCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  // Status Card
  statusCard: {
    marginBottom: theme.spacing.s16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s4,
  },
  statusValue: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s12,
    backgroundColor: '#FEF3C7', // Amber 100
    borderRadius: theme.radii.md,
    gap: theme.spacing.s8,
  },
  warningText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: '#B45309', // Amber 700
    fontWeight: theme.fontWeights.medium,
  },
  // Biometric Card
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  biometricIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  biometricContent: {
    flex: 1,
    marginRight: theme.spacing.s12,
  },
  biometricTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  biometricSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  // Section Headers
  sectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s24,
    marginBottom: theme.spacing.s8,
  },
  sectionSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s16,
    lineHeight: 20,
  },
  inputSpacer: {
    height: theme.spacing.s8,
  },
  setPinButton: {
    marginTop: theme.spacing.s16,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s12,
    gap: theme.spacing.s8,
  },
  clearButtonText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
  },
  // Tips Card
  tipsCard: {
    marginTop: theme.spacing.s24,
    borderColor: theme.colors.accent,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s12,
    gap: theme.spacing.s8,
  },
  tipsTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: theme.spacing.s8,
  },
  tipBullet: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.accent,
    marginRight: theme.spacing.s8,
    fontWeight: theme.fontWeights.bold,
  },
  tipText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: theme.spacing.s32,
  },
});

export default SecuritySettingsScreen;
