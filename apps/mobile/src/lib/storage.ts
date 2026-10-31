import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Browser preview only: the web has no secure store.
const web = Platform.OS === 'web';

export const storage = {
  get: async (key: string) => (web ? localStorage.getItem(key) : SecureStore.getItemAsync(key)),
  set: async (key: string, value: string | null) => {
    if (web) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};

export const REFRESH_KEY = 'roomora.refresh';
export const BIOMETRIC_KEY = 'roomora.biometric';
export const WORKSPACE_KEY = 'roomora.workspace';
