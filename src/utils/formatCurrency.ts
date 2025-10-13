/**
 * @description
 * Utility functions for formatting currency values in the application.
 * Handles conversion between kobo (backend format) and naira (display format).
 *
 * @dependencies
 * - None - pure utility functions
 */

/**
 * Formats an amount in kobo to a displayable naira string
 * @param amountInKobo - The amount in kobo (smallest currency unit)
 * @returns Formatted currency string (e.g., "₦1,500.00")
 */
export const formatCurrency = (amountInKobo: number): string => {
  const nairaAmount = amountInKobo / 100;
  return `₦${nairaAmount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Converts a naira amount to kobo
 * @param nairaAmount - The amount in naira
 * @returns The amount in kobo
 */
export const nairaToKobo = (nairaAmount: number): number => {
  return Math.round(nairaAmount * 100);
};

/**
 * Converts a kobo amount to naira
 * @param koboAmount - The amount in kobo
 * @returns The amount in naira
 */
export const koboToNaira = (koboAmount: number): number => {
  return koboAmount / 100;
};
