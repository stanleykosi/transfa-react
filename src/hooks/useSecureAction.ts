/**
 * @description
 * This custom hook provides a secure way to execute sensitive actions by wrapping
 * them in an authentication layer. It first attempts to use biometrics, and if that
 * is not available or fails, it falls back to a PIN entry modal.
 *
 * Key features:
 * - Prompts for biometrics (Face ID/Touch ID) for quick authorization.
 * - Provides a PIN input modal as a fallback.
 * - Manages all the state related to the authorization flow (e.g., modal visibility, errors).
 * - Decouples security logic from business logic components.
 * - Development mode bypass for testing with Expo Go (controlled by EXPO_PUBLIC_SKIP_PIN_CHECK env var)
 *
 * @dependencies
 * - react: For `useState`, `useCallback`.
 * - react-native-biometrics: For accessing native biometric authentication.
 * - @/store/useSecurityStore: For checking PIN status and verifying the PIN.
 * - @/components/PinInputModal: The UI component for the PIN fallback.
 *
 * @returns
 * - `isModalVisible`: A boolean indicating if the PIN modal is currently shown.
 * - `triggerSecureAction`: A function that takes a callback (the action to secure)
 *   and initiates the authentication flow.
 *
 * @example
 * const { triggerSecureAction } = useSecureAction();
 * const handlePayment = () => {
 *   // ... payment logic
 * };
 *
 * <PrimaryButton
 *   title="Send Money"
 *   onPress={() => triggerSecureAction(handlePayment)}
 * />
 */
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useSecurityStore } from '@/store/useSecurityStore';

const rnBiometrics = new ReactNativeBiometrics();

// Function to check if development mode is enabled (done at runtime, not module load)
const isDevModeEnabled = () => {
  const skipPin = process.env.EXPO_PUBLIC_SKIP_PIN_CHECK === 'true';
  return skipPin;
};

export const useSecureAction = () => {
  const { isPinSet, biometricsEnabled, verifyPin } = useSecurityStore();
  const [isModalVisible, setModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionToExecute, setActionToExecute] = useState<(() => void) | null>(null);

  const executeAction = useCallback(() => {
    if (actionToExecute) {
      actionToExecute();
    }
    setModalVisible(false);
    setActionToExecute(null);
  }, [actionToExecute]);

  const handlePinSuccess = async (pin: string) => {
    const isValid = await verifyPin(pin);
    if (isValid) {
      executeAction();
    } else {
      setError('Incorrect PIN. Please try again.');
    }
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const triggerSecureAction = useCallback(
    async (action: () => void) => {
      // Development mode: skip PIN/biometric check entirely
      if (isDevModeEnabled()) {
        console.warn(
          '⚠️  DEVELOPMENT MODE: Skipping PIN/biometric check (EXPO_PUBLIC_SKIP_PIN_CHECK=true)'
        );
        action();
        return;
      }

      if (!isPinSet) {
        Alert.alert(
          'PIN Not Set',
          'Please set up a transaction PIN in your security settings before proceeding.'
        );
        return;
      }

      setActionToExecute(() => action);

      try {
        // Check if user has enabled biometrics in app settings
        if (biometricsEnabled) {
          const { available, biometryType } = await rnBiometrics.isSensorAvailable();

          if (available && biometryType) {
            const { success } = await rnBiometrics.simplePrompt({
              promptMessage: 'Confirm your identity to proceed',
              cancelButtonText: 'Use PIN Instead',
            });

            if (success) {
              executeAction();
            } else {
              // User cancelled or biometric failed, fall back to PIN
              setModalVisible(true);
            }
          } else {
            // Biometrics not available, go directly to PIN
            setModalVisible(true);
          }
        } else {
          // User has disabled biometrics in app settings, go directly to PIN
          setModalVisible(true);
        }
      } catch (biometricError) {
        console.warn('Biometric check failed:', biometricError);
        // An error occurred, fall back to PIN
        setModalVisible(true);
      }
    },
    [isPinSet, biometricsEnabled, executeAction]
  );

  return {
    isModalVisible,
    error,
    triggerSecureAction,
    handlePinSuccess,
    clearError,
    closeModal: () => setModalVisible(false),
  };
};
