/**
 * @description
 * Platform-specific Clerk components that use @clerk/clerk-react for web
 * and @clerk/clerk-expo for mobile platforms. This provides a unified
 * interface for Clerk UI components across all platforms.
 *
 * @dependencies
 * - @clerk/clerk-react: For web platform components
 * - @clerk/clerk-expo: For mobile platform components
 * - react-native: For Platform detection
 */

import React from 'react';
import { Platform } from 'react-native';

// Platform-specific imports
import { SignIn as SignInExpo, SignUp as SignUpExpo } from '@clerk/clerk-expo';
import { SignIn as SignInReact, SignUp as SignUpReact } from '@clerk/clerk-react';

// Platform-specific component wrappers
export const SignIn = Platform.OS === 'web' ? SignInReact : SignInExpo;
export const SignUp = Platform.OS === 'web' ? SignUpReact : SignUpExpo;
