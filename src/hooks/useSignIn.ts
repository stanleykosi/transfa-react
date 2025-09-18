/**
 * @description
 * Platform-specific sign-in hook that uses @clerk/clerk-react for web
 * and @clerk/clerk-expo for mobile platforms.
 */

import { Platform } from 'react-native';

// Platform-specific imports
import { useSignIn as useSignInExpo } from '@clerk/clerk-expo';
import { useSignIn as useSignInReact } from '@clerk/clerk-react';

// Re-export the appropriate hook based on platform
export const useSignIn = Platform.OS === 'web' ? useSignInReact : useSignInExpo;
