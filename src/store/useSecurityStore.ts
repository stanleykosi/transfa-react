import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { fetchSecurityStatus } from '@/api/authApi';

const PIN_KEY = 'com.transfaapp.pin';

interface SecurityState {
  isPinSet: boolean;
  biometricsEnabled: boolean;
  checkPinStatus: () => Promise<void>;
  getPin: () => Promise<string | null>;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => void;
}

const getStoredPin = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return null;
  }

  return SecureStore.getItemAsync(PIN_KEY, {
    keychainService: PIN_KEY,
  });
};

const setStoredPin = async (pin: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return false;
  }

  await SecureStore.setItemAsync(PIN_KEY, pin, {
    keychainService: PIN_KEY,
  });
  return true;
};

const removeStoredPin = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    return;
  }

  await SecureStore.deleteItemAsync(PIN_KEY, {
    keychainService: PIN_KEY,
  });
};

export const useSecurityStore = create<SecurityState>((set) => ({
  isPinSet: false,
  biometricsEnabled: true,

  checkPinStatus: async () => {
    try {
      if (Platform.OS === 'web') {
        const status = await fetchSecurityStatus();
        set({ isPinSet: status.transaction_pin_set });
        return;
      }
      const pin = await getStoredPin();
      set({ isPinSet: !!pin });
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      set({ isPinSet: false });
    }
  },

  getPin: async () => {
    try {
      return await getStoredPin();
    } catch (error) {
      console.error('Failed to retrieve PIN:', error);
      return null;
    }
  },

  setPin: async (pin: string) => {
    if (Platform.OS === 'web') {
      try {
        const status = await fetchSecurityStatus();
        set({ isPinSet: status.transaction_pin_set });
      } catch (error) {
        console.error('Failed to refresh server PIN status:', error);
        set({ isPinSet: false });
      }
      return;
    }
    const persisted = await setStoredPin(pin);
    set({ isPinSet: persisted });
  },

  clearPin: async () => {
    await removeStoredPin();
    set({ isPinSet: false });
  },

  verifyPin: async (pin: string) => {
    try {
      if (Platform.OS === 'web') {
        return false;
      }
      const storedPin = await getStoredPin();
      return storedPin === pin;
    } catch (error) {
      console.error('Failed to verify PIN:', error);
      return false;
    }
  },

  setBiometricsEnabled: (enabled: boolean) => {
    set({ biometricsEnabled: enabled });
  },
}));

useSecurityStore.getState().checkPinStatus();
