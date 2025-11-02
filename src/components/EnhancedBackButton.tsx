/**
 * @description
 * Enhanced back button with modern styling, animation and haptic feedback.
 * Provides a consistent navigation experience across all screens.
 *
 * @dependencies
 * - react-native: For TouchableOpacity
 * - react-native-reanimated: For entrance animation
 * - expo-haptics: For haptic feedback
 */
import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/theme';
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';

interface EnhancedBackButtonProps {
  onPress: () => void;
  delay?: number;
}

const EnhancedBackButton: React.FC<EnhancedBackButtonProps> = ({ onPress, delay = 0 }) => {
  const animation = useEntranceAnimation({ delay, duration: 400 });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={animation.animatedStyle}>
      <TouchableOpacity style={styles.backButton} onPress={handlePress}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    padding: theme.spacing.s8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
});

export default EnhancedBackButton;
