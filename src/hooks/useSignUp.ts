/**
 * @description
 * Platform-specific sign-up hook that uses @clerk/clerk-react for web
 * and @clerk/clerk-expo for mobile platforms.
 */

import { Platform } from 'react-native';

// Platform-specific imports
import { useSignUp as useSignUpExpo } from '@clerk/clerk-expo';
import { useSignUp as useSignUpReact } from '@clerk/clerk-react';

// Re-export the appropriate hook based on platform
export const useSignUp = Platform.OS === 'web' ? useSignUpReact : useSignUpExpo;
