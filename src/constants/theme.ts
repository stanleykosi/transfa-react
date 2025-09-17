/**
 * @description
 * This file consolidates the application's design system, including spacing, font sizes,
 * and border radii. It follows the 4pt grid system for consistent and scalable UI design.
 *
 * @dependencies
 * - COLORS: Imports the color palette to be used in component styles.
 *
 * @notes
 * - Components should import their styling constants from this file to maintain a unified design language.
 */

import { Dimensions } from 'react-native';
import { COLORS } from './colors';

const { width, height } = Dimensions.get('window');

// Spacing based on a 4pt grid system
export const SPACING = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
};

// Font sizes for different text roles
export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

// Font weights
export const FONT_WEIGHTS = {
  light: '300' as const,
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Border radii for components like cards, buttons, and inputs
export const BORDER_RADII = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Application-wide theme object
export const theme = {
  colors: COLORS,
  spacing: SPACING,
  fontSizes: FONT_SIZES,
  fontWeights: FONT_WEIGHTS,
  radii: BORDER_RADII,
  dimensions: {
    width,
    height,
  },
};

export default theme;
