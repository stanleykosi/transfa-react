/**
 * @description
 * Enhanced summary card component with modern styling and animations.
 * Displays transaction/payment details with polished visual treatment.
 *
 * @dependencies
 * - react-native: For core components
 * - react-native-reanimated: For entrance animations
 * - @/hooks/useEntranceAnimation: For animation effects
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';

interface SummaryItem {
  label: string;
  value: string;
  isHighlighted?: boolean;
}

interface EnhancedSummaryCardProps {
  items: SummaryItem[];
  title?: string;
  delay?: number;
}

const EnhancedSummaryCard: React.FC<EnhancedSummaryCardProps> = ({ items, title, delay = 200 }) => {
  const animation = useEntranceAnimation({ delay, duration: 500 });

  return (
    <Animated.View style={[styles.card, animation.animatedStyle]}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {items.map((item, index) => (
        <View key={index} style={[styles.row, item.isHighlighted && styles.rowHighlighted]}>
          <Text style={[styles.label, item.isHighlighted && styles.labelHighlighted]}>
            {item.label}
          </Text>
          <Text style={[styles.value, item.isHighlighted && styles.valueHighlighted]}>
            {item.value}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: theme.spacing.s20,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s16,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s16,
  },
  rowHighlighted: {
    borderTopWidth: 2,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.s16,
    marginTop: theme.spacing.s4,
  },
  label: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  labelHighlighted: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
  },
  value: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.semibold,
    letterSpacing: -0.3,
  },
  valueHighlighted: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.lg,
    letterSpacing: -0.5,
  },
});

export default EnhancedSummaryCard;
