/**
 * @description
 * This file defines the central color palette for the Transfa application.
 * By centralizing color definitions, we ensure a consistent look and feel across the app
 * and make it easy to update the theme in one place.
 *
 * @notes
 * - These colors are based on the design system outlined in the technical specification.
 * - Always import colors from this file instead of using hardcoded hex values in components.
 */

export const COLORS = {
  /**
   * Primary color for main actions, buttons, and highlights.
   * Modern fintech indigo/purple for trust and sophistication
   * Value: #5B48E8 (Enhanced Indigo)
   */
  primary: '#5B48E8',

  /**
   * Secondary color for success states, confirmation messages, and complementary actions.
   * Value: #10B981 (Emerald)
   */
  secondary: '#10B981',

  /**
   * The default background color for most screens.
   * Soft off-white for reduced eye strain
   * Value: #F7F8FC (Cool Gray 50)
   */
  background: '#F7F8FC',

  /**
   * Background color for elevated surfaces like cards, modals, and headers.
   * Value: #FFFFFF (White)
   */
  surface: '#FFFFFF',

  /**
   * Primary text color for headings and important information.
   * Deep charcoal for better readability
   * Value: #1A1D2E (Dark Navy)
   */
  textPrimary: '#1A1D2E',

  /**
   * Secondary text color for subtitles, descriptions, and less important information.
   * Value: #6B7280 (Gray 500)
   */
  textSecondary: '#6B7280',

  /**
   * Color used for error messages, validation failures, and destructive actions.
   * Value: #EF4444 (Red 500)
   */
  error: '#EF4444',

  /**
   * A light gray color often used for borders, dividers, or disabled states.
   * Value: #E5E7EB (Gray 200)
   */
  border: '#E5E7EB',

  /**
   * A color for disabled component states.
   * Value: #D1D5DB (Gray 300)
   */
  disabled: '#D1D5DB',

  /**
   * Text color for elements on a primary color background (e.g., button text).
   * Value: #FFFFFF (White)
   */
  textOnPrimary: '#FFFFFF',

  /**
   * Success color for positive states and confirmations.
   * Vibrant green for positive feedback
   * Value: #00D68F (Teal Green)
   */
  success: '#00D68F',

  /**
   * Warning color for caution states and pending actions.
   * Value: #FFB020 (Warm Amber)
   */
  warning: '#FFB020',

  /**
   * Light version of primary color for backgrounds and highlights.
   * Value: #EEF2FF (Indigo 50)
   */
  primaryLight: '#EEF2FF',

  /**
   * Accent color for special highlights and CTAs
   * Value: #7C3AED (Purple Accent)
   */
  accent: '#7C3AED',

  /**
   * Info color for informational messages
   * Value: #3B82F6 (Blue)
   */
  info: '#3B82F6',

  /**
   * Gradient colors for premium features
   */
  gradientStart: '#5B48E8',
  gradientEnd: '#7C3AED',
};
