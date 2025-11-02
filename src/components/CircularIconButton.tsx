/**
 * @description
 * Circular icon button component for fintech action grid.
 * Features gradient backgrounds, smooth animations, and haptic feedback.
 *
 * @dependencies
 * - react-native: For TouchableOpacity, View, Text
 * - react-native-reanimated: For animations
 * - @expo/vector-icons: For icon support
 * - expo-linear-gradient: For gradient backgrounds
 * - @/hooks/useAnimatedPress: For press animations
 */
import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';

interface CircularIconButtonProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'gradient' | 'solid' | 'outline';
  color?: string;
  gradientColors?: [string, string];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CircularIconButton: React.FC<CircularIconButtonProps> = ({
  title,
  icon,
  onPress,
  variant = 'gradient',
  color = theme.colors.primary,
  gradientColors = [theme.colors.gradientStart, theme.colors.gradientEnd],
  disabled = false,
  style,
}) => {
  const { animatedStyle, handlePressIn, handlePressOut } = useAnimatedPress({
    scaleValue: 0.92,
    duration: 100,
  });

  const renderIconContainer = () => {
    const iconContent = (
      <Ionicons
        name={icon}
        size={28}
        color={variant === 'outline' ? color : theme.colors.textOnPrimary}
      />
    );

    if (variant === 'gradient') {
      return (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconContainer}
        >
          {iconContent}
        </LinearGradient>
      );
    }

    if (variant === 'solid') {
      return <View style={[styles.iconContainer, { backgroundColor: color }]}>{iconContent}</View>;
    }

    // Outline variant
    return (
      <View style={[styles.iconContainer, styles.outlineContainer, { borderColor: color }]}>
        {iconContent}
      </View>
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.container, style]}
    >
      <Animated.View style={[styles.wrapper, animatedStyle]}>
        {renderIconContainer()}
        <Text style={styles.label} numberOfLines={1}>
          {title}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  wrapper: {
    alignItems: 'center',
    width: 72,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.s8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  label: {
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
});

export default CircularIconButton;
