/**
 * @description
 * A standardized primary button component for the application.
 * It encapsulates the main call-to-action style and behavior, including
 * loading and disabled states.
 *
 * @dependencies
 * - react-native: For core components like TouchableOpacity, Text, and ActivityIndicator.
 * - @/constants/theme: To access the app's color palette and styling constants.
 *
 * @props
 * - title (string): The text to display on the button.
 * - onPress (() => void): The function to execute when the button is pressed.
 * - isLoading (boolean, optional): If true, shows a loading indicator instead of the title.
 * - disabled (boolean, optional): If true, the button is non-interactive and styled accordingly.
 * - style (StyleProp<ViewStyle>, optional): Custom styles to apply to the button container.
 *
 * @notes
 * - The button is disabled automatically when `isLoading` is true to prevent multiple presses.
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import { theme } from '@/constants/theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const isButtonDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      style={[styles.button, isButtonDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isButtonDisabled}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator color={theme.colors.textOnPrimary} />
      ) : (
        <Text style={[styles.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.s16,
    paddingHorizontal: theme.spacing.s24,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56, // Ensures consistent height even with ActivityIndicator
  },
  disabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.7,
  },
  text: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
  },
});

export default PrimaryButton;
