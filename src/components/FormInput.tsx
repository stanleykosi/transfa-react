/**
 * @description
 * A reusable form input component that includes a label, text input, and an optional
 * error message. This component standardizes form fields across the application.
 *
 * @dependencies
 * - react-native: For View, Text, and TextInput components.
 * - @/constants/theme: For consistent styling from the design system.
 *
 * @props
 * - label (string): The text to display for the input's label.
 * - error (string, optional): An error message to display below the input.
 * - All other props are passed directly to the underlying TextInput component, allowing
 *   for full customization (e.g., `placeholder`, `keyboardType`, `secureTextEntry`).
 *
 * @example
 * <FormInput
 *   label="Email Address"
 *   value={email}
 *   onChangeText={setEmail}
 *   keyboardType="email-address"
 *   error={emailError}
 * />
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { theme } from '@/constants/theme';

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string;
}

const FormInput: React.FC<FormInputProps> = ({ label, error, ...textInputProps }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={theme.colors.textSecondary}
        {...textInputProps}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: theme.spacing.s16,
  },
  label: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.s16,
    paddingVertical: theme.spacing.s12,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    minHeight: 50,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.xs,
    marginTop: theme.spacing.s4,
  },
});

export default FormInput;
