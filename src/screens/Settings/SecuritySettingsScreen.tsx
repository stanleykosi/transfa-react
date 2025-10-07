/**
 * @description
 * This screen provides the UI for users to manage their security settings,
 * specifically setting up or changing their 4-digit transaction PIN.
 *
 * Key features:
 * - Allows a user to create a new PIN.
 * - Requires PIN confirmation to prevent typos.
 * - Shows the current status (if a PIN is set or not).
 * - Allows a user to clear their existing PIN.
 *
 * @dependencies
 * - react, react-native: For UI and state management.
 * - @/components/*: Reusable UI components.
 * - @/store/useSecurityStore: Zustand store for PIN state and actions.
 * - @react-navigation/native: For navigation actions (e.g., goBack).
 *
 * @notes
 * - The PIN input fields use `keyboardType="number-pad"` and `maxLength={4}` for a better UX.
 * - All secure storage operations are handled by the `useSecurityStore` hook.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { useSecurityStore } from '@/store/useSecurityStore';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';

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
      await setPin(pin);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Security</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView>
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>PIN Status:</Text>
          <Text
            style={[
              styles.statusValue,
              { color: isPinSet ? theme.colors.secondary : theme.colors.error },
            ]}
          >
            {isPinSet ? 'Active' : 'Not Set'}
          </Text>
        </View>

        <View style={styles.biometricSection}>
          <View style={styles.biometricRow}>
            <View style={styles.biometricInfo}>
              <Text style={styles.biometricTitle}>Use Biometrics</Text>
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
        </View>

        <Text style={styles.sectionTitle}>{isPinSet ? 'Change Your PIN' : 'Set a New PIN'}</Text>
        <Text style={styles.sectionSubtitle}>
          This 4-digit PIN will be used to authorize all transactions.
        </Text>

        <FormInput
          label="New 4-Digit PIN"
          value={pin}
          onChangeText={setPinValue}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          placeholder="••••"
        />
        <FormInput
          label="Confirm New PIN"
          value={confirmPin}
          onChangeText={setConfirmPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          placeholder="••••"
        />
        <PrimaryButton
          title={isPinSet ? 'Update PIN' : 'Set PIN'}
          onPress={handleSetPin}
          isLoading={isLoading}
        />
        {isPinSet && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearPin}>
            <Text style={styles.clearButtonText}>Clear Existing PIN</Text>
          </TouchableOpacity>
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
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.s16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.s32,
  },
  statusLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  statusValue: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    marginLeft: theme.spacing.s8,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  sectionSubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s24,
  },
  clearButton: {
    marginTop: theme.spacing.s16,
    alignItems: 'center',
  },
  clearButtonText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.medium,
  },
  biometricSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s24,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: {
    flex: 1,
    marginRight: theme.spacing.s16,
  },
  biometricTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  biometricSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});

export default SecuritySettingsScreen;
