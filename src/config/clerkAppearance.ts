/**
 * @description
 * Platform-specific Clerk appearance configurations for web and mobile.
 * This centralizes all Clerk UI customization, making it easy to maintain
 * and update the authentication flow styling.
 *
 * @dependencies
 * - @/constants/theme: For consistent design system values
 * - @/constants/colors: For brand color palette
 */

import { Platform } from 'react-native';
import { theme } from '@/constants/theme';

// Web-specific Clerk appearance configuration
const webAppearance = {
  baseTheme: undefined, // Use Clerk's default base theme
  variables: {
    colorPrimary: theme.colors.primary,
    colorBackground: theme.colors.background,
    colorInputBackground: theme.colors.surface,
    colorInputText: theme.colors.textPrimary,
    colorText: theme.colors.textPrimary,
    colorTextSecondary: theme.colors.textSecondary,
    colorDanger: theme.colors.error,
    colorSuccess: theme.colors.secondary,
    borderRadius: `${theme.radii.md}px`,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: `${theme.fontSizes.base}px`,
    fontWeight: {
      normal: theme.fontWeights.normal,
      medium: theme.fontWeights.medium,
      semibold: theme.fontWeights.semibold,
      bold: theme.fontWeights.bold,
    },
    spacingUnit: `${theme.spacing.s4}px`,
  },
  elements: {
    // Customize specific Clerk components
    card: {
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      borderRadius: `${theme.radii.lg}px`,
      border: `1px solid ${theme.colors.border}`,
    },
    headerTitle: {
      fontSize: `${theme.fontSizes['2xl']}px`,
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: `${theme.fontSizes.base}px`,
      color: theme.colors.textSecondary,
    },
    socialButtonsBlockButton: {
      borderRadius: `${theme.radii.md}px`,
      border: `1px solid ${theme.colors.border}`,
      '&:hover': {
        backgroundColor: theme.colors.background,
      },
    },
    formButtonPrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: `${theme.radii.md}px`,
      fontSize: `${theme.fontSizes.base}px`,
      fontWeight: theme.fontWeights.semibold,
      '&:hover': {
        backgroundColor: '#4338CA', // Darker shade of primary
      },
    },
    formFieldInput: {
      borderRadius: `${theme.radii.md}px`,
      border: `1px solid ${theme.colors.border}`,
      fontSize: `${theme.fontSizes.base}px`,
      '&:focus': {
        borderColor: theme.colors.primary,
        boxShadow: `0 0 0 3px ${theme.colors.primary}20`, // 20% opacity
      },
    },
    footerActionLink: {
      color: theme.colors.primary,
      fontWeight: theme.fontWeights.semibold,
      '&:hover': {
        color: '#4338CA',
      },
    },
  },
};

// Mobile-specific Clerk appearance configuration
const mobileAppearance = {
  baseTheme: undefined, // Use Clerk's default base theme
  variables: {
    colorPrimary: theme.colors.primary,
    colorBackground: theme.colors.background,
    colorInputBackground: theme.colors.surface,
    colorInputText: theme.colors.textPrimary,
    colorText: theme.colors.textPrimary,
    colorTextSecondary: theme.colors.textSecondary,
    colorDanger: theme.colors.error,
    colorSuccess: theme.colors.secondary,
    borderRadius: `${theme.radii.lg}px`, // Larger radius for mobile
    fontFamily: 'System', // iOS/Android system font
    fontSize: `${theme.fontSizes.lg}px`, // Slightly larger for mobile
    fontWeight: {
      normal: theme.fontWeights.normal,
      medium: theme.fontWeights.medium,
      semibold: theme.fontWeights.semibold,
      bold: theme.fontWeights.bold,
    },
    spacingUnit: `${theme.spacing.s8}px`, // More spacing for mobile
  },
  elements: {
    // Mobile-optimized component styling
    card: {
      borderRadius: `${theme.radii.xl}px`,
      border: `1px solid ${theme.colors.border}`,
      margin: `${theme.spacing.s16}px`,
    },
    headerTitle: {
      fontSize: `${theme.fontSizes['3xl']}px`, // Larger for mobile
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: `${theme.fontSizes.lg}px`,
      color: theme.colors.textSecondary,
    },
    socialButtonsBlockButton: {
      borderRadius: `${theme.radii.lg}px`,
      border: `1px solid ${theme.colors.border}`,
      padding: `${theme.spacing.s16}px`,
      fontSize: `${theme.fontSizes.lg}px`,
    },
    formButtonPrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: `${theme.radii.lg}px`,
      fontSize: `${theme.fontSizes.lg}px`,
      fontWeight: theme.fontWeights.semibold,
      padding: `${theme.spacing.s16}px`,
      minHeight: '48px', // Touch-friendly height
    },
    formFieldInput: {
      borderRadius: `${theme.radii.lg}px`,
      border: `1px solid ${theme.colors.border}`,
      fontSize: `${theme.fontSizes.lg}px`,
      padding: `${theme.spacing.s16}px`,
      minHeight: '48px', // Touch-friendly height
    },
    footerActionLink: {
      color: theme.colors.primary,
      fontWeight: theme.fontWeights.semibold,
      fontSize: `${theme.fontSizes.lg}px`,
    },
  },
};

// Export platform-specific appearance
export const getClerkAppearance = () => {
  return Platform.OS === 'web' ? webAppearance : mobileAppearance;
};

// Export individual configurations for advanced use cases
export { webAppearance, mobileAppearance };
