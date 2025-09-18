/**
 * @description
 * Pre-configured Clerk themes for easy customization and future updates.
 * This file provides ready-to-use theme configurations that can be
 * easily switched or customized.
 *
 * @usage
 * - Import the theme you want: import { darkTheme, lightTheme, brandTheme } from '@/config/clerkThemes'
 * - Use in ClerkProvider: <ClerkProvider appearance={brandTheme} />
 * - Or modify existing themes for your brand
 */

import { theme } from '@/constants/theme';

// Light theme (default)
export const lightTheme = {
  baseTheme: undefined,
  variables: {
    colorPrimary: theme.colors.primary,
    colorBackground: theme.colors.background,
    colorInputBackground: theme.colors.surface,
    colorText: theme.colors.textPrimary,
    colorTextSecondary: theme.colors.textSecondary,
  },
};

// Dark theme
export const darkTheme = {
  baseTheme: undefined,
  variables: {
    colorPrimary: '#6366F1', // Lighter indigo for dark mode
    colorBackground: '#1F2937', // Dark gray
    colorInputBackground: '#374151', // Darker gray
    colorText: '#F9FAFB', // Light text
    colorTextSecondary: '#D1D5DB', // Light secondary text
    colorDanger: '#F87171', // Light red
    colorSuccess: '#34D399', // Light green
  },
};

// Brand-focused theme (more colorful)
export const brandTheme = {
  baseTheme: undefined,
  variables: {
    colorPrimary: theme.colors.primary,
    colorBackground: theme.colors.background,
    colorInputBackground: theme.colors.surface,
    colorText: theme.colors.textPrimary,
    colorTextSecondary: theme.colors.textSecondary,
    colorSuccess: theme.colors.secondary,
    borderRadius: `${theme.radii.lg}px`,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    formButtonPrimary: {
      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      borderRadius: `${theme.radii.lg}px`,
      boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.3)',
    },
    card: {
      borderRadius: `${theme.radii.xl}px`,
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    },
  },
};

// Minimal theme (clean and simple)
export const minimalTheme = {
  baseTheme: undefined,
  variables: {
    colorPrimary: theme.colors.textPrimary,
    colorBackground: theme.colors.surface,
    colorInputBackground: theme.colors.surface,
    colorText: theme.colors.textPrimary,
    colorTextSecondary: theme.colors.textSecondary,
    borderRadius: '0px', // Sharp corners
    fontFamily: 'system-ui, sans-serif',
  },
  elements: {
    card: {
      boxShadow: 'none',
      border: `1px solid ${theme.colors.border}`,
    },
    formButtonPrimary: {
      backgroundColor: theme.colors.textPrimary,
      borderRadius: '0px',
      '&:hover': {
        backgroundColor: theme.colors.textSecondary,
      },
    },
  },
};

// Export all themes for easy access
export const clerkThemes = {
  light: lightTheme,
  dark: darkTheme,
  brand: brandTheme,
  minimal: minimalTheme,
};

// Helper function to get theme by name
export const getTheme = (themeName: keyof typeof clerkThemes) => {
  return clerkThemes[themeName] || lightTheme;
};
