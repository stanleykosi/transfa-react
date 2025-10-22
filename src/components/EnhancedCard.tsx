/**
 * @description
 * Enhanced Card component with modern fintech styling including shadows, elevation, and gradients.
 * Provides a polished, professional look with customizable padding and margin.
 *
 * @dependencies
 * - react-native: For View and StyleSheet
 * - @/constants/theme: For consistent styling
 *
 * @props
 * - children: Content to display inside the card
 * - style: Optional custom styles
 * - variant: 'default' | 'elevated' | 'outlined' | 'gradient' - Different card styles
 * - onPress: Optional press handler to make card touchable
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, TouchableOpacity, Platform } from 'react-native';
import { theme } from '@/constants/theme';

interface EnhancedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outlined' | 'gradient';
  onPress?: () => void;
}

const EnhancedCard: React.FC<EnhancedCardProps> = ({
  children,
  style,
  variant = 'default',
  onPress,
}) => {
  const getCardStyle = () => {
    switch (variant) {
      case 'elevated':
        return styles.elevated;
      case 'outlined':
        return styles.outlined;
      case 'gradient':
        return styles.gradient;
      default:
        return styles.default;
    }
  };

  const CardContent = <View style={[styles.container, getCardStyle(), style]}>{children}</View>;

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[styles.container, getCardStyle(), style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return CardContent;
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s20,
    marginVertical: theme.spacing.s8,
  },
  default: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  elevated: {
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  gradient: {
    backgroundColor: theme.colors.primary,
  },
});

export default EnhancedCard;
