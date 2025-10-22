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
   * Value: #4F46E5 (Indigo)
   */
  primary: '#4F46E5',

  /**
   * Secondary color for success states, confirmation messages, and complementary actions.
   * Value: #10B981 (Emerald)
   */
  secondary: '#10B981',

  /**
   * The default background color for most screens.
   * Value: #F9FAFB (Gray 50)
   */
  background: '#F9FAFB',

  /**
   * Background color for elevated surfaces like cards, modals, and headers.
   * Value: #FFFFFF (White)
   */
  surface: '#FFFFFF',

  /**
   * Primary text color for headings and important information.
   * Value: #1F2937 (Gray 800)
   */
  textPrimary: '#1F2937',

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
   * Value: #10B981 (Emerald)
   */
  success: '#10B981',

  /**
   * Warning color for caution states and pending actions.
   * Value: #F59E0B (Amber)
   */
  warning: '#F59E0B',

  /**
   * Light version of primary color for backgrounds and highlights.
   * Value: #E0E7FF (Indigo 100)
   */
  primaryLight: '#E0E7FF',
};
