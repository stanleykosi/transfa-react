/**
 * @description
 * Platform-specific auth hooks that use @clerk/clerk-react for web
 * and @clerk/clerk-expo for mobile platforms. This provides a unified
 * interface for authentication across all platforms.
 *
 * @dependencies
 * - @clerk/clerk-react: For web platform auth hooks
 * - @clerk/clerk-expo: For mobile platform auth hooks
 * - react-native: For Platform detection
 */

import { Platform } from 'react-native';

// Platform-specific imports
import { useAuth as useAuthExpo } from '@clerk/clerk-expo';
import { useAuth as useAuthReact } from '@clerk/clerk-react';

// Re-export the appropriate hook based on platform
export const useAuth = Platform.OS === 'web' ? useAuthReact : useAuthExpo;
