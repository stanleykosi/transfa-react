/**
 * @description
 * Modern action button component with icon support for fintech applications.
 * Features smooth animations, gradient backgrounds, and multiple variants.
 *
 * @dependencies
 * - react-native: For TouchableOpacity, View, Text
 * - @expo/vector-icons: For icon support
 * - @/constants/theme: For styling
 *
 * @props
 * - title: Button text
 * - icon: Icon name from Ionicons
 * - onPress: Press handler
 * - variant: 'primary' | 'secondary' | 'outline' | 'success' - Button style
 * - size: 'small' | 'medium' | 'large' - Button size
 * - disabled: Disable the button
 * - loading: Show loading state
 */
import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface ActionButtonProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  icon,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
}) => {
  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[`${size}Button`]];

    switch (variant) {
      case 'primary':
        return [...baseStyle, styles.primaryButton];
      case 'secondary':
        return [...baseStyle, styles.secondaryButton];
      case 'outline':
        return [...baseStyle, styles.outlineButton];
      case 'success':
        return [...baseStyle, styles.successButton];
      default:
        return [...baseStyle, styles.primaryButton];
    }
  };

  const getTextStyle = () => {
    const baseStyle = [styles.text, styles[`${size}Text`]];

    switch (variant) {
      case 'outline':
        return [...baseStyle, styles.outlineText];
      default:
        return [...baseStyle, styles.whiteText];
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'outline':
        return theme.colors.primary;
      default:
        return theme.colors.textOnPrimary;
    }
  };

  const iconSize = size === 'small' ? 18 : size === 'large' ? 26 : 22;

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getIconColor()} />
      ) : (
        <View style={styles.content}>
          {icon && (
            <Ionicons name={icon} size={iconSize} color={getIconColor()} style={styles.icon} />
          )}
          <Text style={getTextStyle()}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: theme.spacing.s8,
  },
  // Size variants
  smallButton: {
    paddingVertical: theme.spacing.s8,
    paddingHorizontal: theme.spacing.s16,
  },
  mediumButton: {
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s24,
  },
  largeButton: {
    paddingVertical: theme.spacing.s16,
    paddingHorizontal: theme.spacing.s32,
  },
  // Color variants
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.secondary,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  successButton: {
    backgroundColor: theme.colors.success,
  },
  disabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.6,
  },
  // Text styles
  text: {
    fontWeight: theme.fontWeights.semibold,
  },
  smallText: {
    fontSize: theme.fontSizes.sm,
  },
  mediumText: {
    fontSize: theme.fontSizes.base,
  },
  largeText: {
    fontSize: theme.fontSizes.lg,
  },
  whiteText: {
    color: theme.colors.textOnPrimary,
  },
  outlineText: {
    color: theme.colors.primary,
  },
});

export default ActionButton;
