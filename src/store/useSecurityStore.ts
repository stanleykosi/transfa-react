/**
 * @description
 * This file creates and configures a Zustand store for managing security-related state
 * within the application. It handles the logic for setting, verifying, and checking the
 * status of the user's security PIN, abstracting the underlying secure storage mechanism.
 *
 * Key features:
 * - isPinSet: A boolean state that reactively informs the UI if a PIN is configured.
 * - checkPinStatus: An async action to synchronize the store's state with the device keychain.
 * - setPin, clearPin, verifyPin: Async actions that interact directly with react-native-keychain
 *   for secure PIN storage and validation.
 *
 * @dependencies
 * - zustand: For creating the state management store.
 * - react-native-keychain: For securely storing and retrieving the PIN from the device's keychain.
 *
 * @notes
 * - The PIN itself is NEVER stored in Zustand's state; it is only ever held in memory briefly
 *   before being passed to the secure keychain.
 * - A unique service name (`PIN_SERVICE_NAME`) is used to avoid conflicts with other data
 *   that might be stored in the keychain.
 * - The store's status is initialized by calling `checkPinStatus` immediately, ensuring the
 *   app is aware of the PIN state as soon as it loads.
 */

import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';

// A unique service name for storing the PIN in the device's keychain.
const PIN_SERVICE_NAME = 'com.transfaapp.pin';

interface SecurityState {
  isPinSet: boolean;
  biometricsEnabled: boolean;
  checkPinStatus: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  isPinSet: false,
  biometricsEnabled: true, // Default to enabled

  /**
   * Checks the device's secure storage to see if a PIN has been set.
   * Updates the `isPinSet` state accordingly.
   */
  checkPinStatus: async () => {
    try {
      const credentials = await Keychain.getGenericPassword({ service: PIN_SERVICE_NAME });
      set({ isPinSet: !!credentials });
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      set({ isPinSet: false });
    }
  },

  /**
   * Securely stores a new PIN in the device's keychain.
   * @param pin The 4-digit PIN string to be stored.
   */
  setPin: async (pin: string) => {
    await Keychain.setGenericPassword('user', pin, { service: PIN_SERVICE_NAME });
    set({ isPinSet: true });
  },

  /**
   * Removes the PIN from the device's secure storage.
   */
  clearPin: async () => {
    await Keychain.resetGenericPassword({ service: PIN_SERVICE_NAME });
    set({ isPinSet: false });
  },

  /**
   * Verifies if the provided PIN matches the one stored securely.
   * @param pin The PIN string to verify.
   * @returns A promise that resolves to `true` if the PIN is correct, `false` otherwise.
   */
  verifyPin: async (pin: string) => {
    try {
      const credentials = await Keychain.getGenericPassword({ service: PIN_SERVICE_NAME });
      return credentials?.password === pin;
    } catch (error) {
      console.error('Failed to verify PIN:', error);
      return false;
    }
  },

  /**
   * Toggles biometric authentication preference.
   * @param enabled Whether biometrics should be used for authentication.
   */
  setBiometricsEnabled: (enabled: boolean) => {
    set({ biometricsEnabled: enabled });
  },
}));

// Initialize the PIN status when the application store is first loaded.
useSecurityStore.getState().checkPinStatus();
