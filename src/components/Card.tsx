/**
 * @description
 * A versatile Card component used as a container for displaying content on an
 * elevated surface. It provides consistent styling with shadows, border radius,
 * and padding.
 *
 * @dependencies
 * - react-native: For the core View component.
 * - @/constants/theme: To access the app's design system for colors, spacing, etc.
 *
 * @props
 * - children (React.ReactNode): The content to be rendered inside the card.
 * - style (StyleProp<ViewStyle>): Optional custom styles to override or extend the default card styles.
 *
 * @example
 * <Card>
 *   <Text>This content is inside a card.</Text>
 * </Card>
 */
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { theme } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const Card: React.FC<CardProps> = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});

export default Card;
