import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { fetchSecurityStatus } from '@/api/authApi';

const PIN_KEY = 'com.transfaapp.pin';

interface SecurityState {
  activeUserId: string | null;
  isPinSet: boolean;
  biometricsEnabled: boolean;
  setActiveUserId: (userId: string | null) => Promise<void>;
  checkPinStatus: () => Promise<void>;
  getPin: () => Promise<string | null>;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => void;
}

const pinStorageKeyForUser = (userId: string): string => `${PIN_KEY}:${userId}`;

const getStoredPin = async (userId: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return null;
  }

  const key = pinStorageKeyForUser(userId);
  return SecureStore.getItemAsync(key, {
    keychainService: key,
  });
};

const setStoredPin = async (userId: string, pin: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return false;
  }

  const key = pinStorageKeyForUser(userId);
  await SecureStore.setItemAsync(key, pin, {
    keychainService: key,
  });
  return true;
};

const removeStoredPin = async (userId: string): Promise<void> => {
  if (Platform.OS === 'web') {
    return;
  }

  const key = pinStorageKeyForUser(userId);
  await SecureStore.deleteItemAsync(key, {
    keychainService: key,
  });
};

export const useSecurityStore = create<SecurityState>((set, get) => ({
  activeUserId: null,
  isPinSet: false,
  biometricsEnabled: true,

  setActiveUserId: async (userId: string | null) => {
    set({ activeUserId: userId });
    await get().checkPinStatus();
  },

  checkPinStatus: async () => {
    try {
      const activeUserId = get().activeUserId;
      if (!activeUserId) {
        set({ isPinSet: false });
        return;
      }

      if (Platform.OS === 'web') {
        const status = await fetchSecurityStatus();
        set({ isPinSet: status.transaction_pin_set });
        return;
      }
      const pin = await getStoredPin(activeUserId);
      set({ isPinSet: !!pin });
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      set({ isPinSet: false });
    }
  },

  getPin: async () => {
    try {
      const activeUserId = get().activeUserId;
      if (!activeUserId) {
        return null;
      }
      return await getStoredPin(activeUserId);
    } catch (error) {
      console.error('Failed to retrieve PIN:', error);
      return null;
    }
  },

  setPin: async (pin: string) => {
    const activeUserId = get().activeUserId;
    if (!activeUserId) {
      set({ isPinSet: false });
      return;
    }

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
    const persisted = await setStoredPin(activeUserId, pin);
    set({ isPinSet: persisted });
  },

  clearPin: async () => {
    const activeUserId = get().activeUserId;
    if (activeUserId) {
      await removeStoredPin(activeUserId);
    }
    set({ isPinSet: false });
  },

  verifyPin: async (pin: string) => {
    try {
      if (Platform.OS === 'web') {
        return false;
      }
      const activeUserId = get().activeUserId;
      if (!activeUserId) {
        return false;
      }
      const storedPin = await getStoredPin(activeUserId);
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
