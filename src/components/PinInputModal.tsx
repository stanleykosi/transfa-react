/**
 * @description
 * A reusable modal component for securely capturing a user's 4-digit PIN. This
 * component is designed to be used by the `useSecureAction` hook as a fallback
 * when biometric authentication is unavailable or fails.
 *
 * Key features:
 * - Displays a clear interface for PIN entry.
 * - Provides feedback for incorrect PIN attempts.
 * - Fully self-contained and controlled by a `visible` prop.
 *
 * @dependencies
 * - react, react-native: For UI and state management.
 * - @/components/PrimaryButton: For the submit action.
 * - @/constants/theme: For consistent styling.
 *
 * @props
 * - visible (boolean): Controls the visibility of the modal.
 * - onClose (() => void): Callback function when the user closes the modal.
 * - onSuccess ((pin: string) => void): Callback function when the user submits a valid 4-digit PIN.
 * - error (string | null): An optional error message to display.
 *
 * @notes
 * - This component does not perform PIN verification itself; it only captures the
 *   input and passes it to the `onSuccess` callback for the calling hook/component to verify.
 */
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';
import PrimaryButton from './PrimaryButton';
import { Ionicons } from '@expo/vector-icons';

interface PinInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  error: string | null;
  clearError: () => void;
}

const PinInputModal: React.FC<PinInputModalProps> = ({
  visible,
  onClose,
  onSuccess,
  error,
  clearError,
}) => {
  const [pin, setPin] = useState('');

  useEffect(() => {
    // Reset PIN when modal becomes visible or hidden
    if (!visible) {
      setPin('');
      clearError();
    }
  }, [visible, clearError]);

  const handlePinChange = (text: string) => {
    // Allow only numeric input
    const numericText = text.replace(/[^0-9]/g, '');
    setPin(numericText);
    if (error) {
      clearError();
    }
  };

  const handleSubmit = () => {
    if (pin.length === 4) {
      onSuccess(pin);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close-circle" size={28} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>Enter your 4-digit PIN to authorize this action.</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={handlePinChange}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="••••"
            placeholderTextColor={theme.colors.textSecondary}
            autoFocus
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <PrimaryButton title="Authorize" onPress={handleSubmit} disabled={pin.length !== 4} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: theme.spacing.s16,
    right: theme.spacing.s16,
  },
  title: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s24,
    textAlign: 'center',
  },
  input: {
    width: '80%',
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    textAlign: 'center',
    fontSize: 32,
    letterSpacing: 16,
    marginBottom: theme.spacing.s16,
    paddingVertical: theme.spacing.s8,
    color: theme.colors.textPrimary,
  },
  errorText: {
    color: theme.colors.error,
    marginBottom: theme.spacing.s16,
    fontSize: theme.fontSizes.sm,
  },
});

export default PinInputModal;
