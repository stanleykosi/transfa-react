/**
 * @description
 * Custom hook for animated button press effect with haptic feedback.
 * Creates a smooth scale animation and provides haptic feedback on press.
 *
 * @dependencies
 * - react-native-reanimated: For performant animations
 * - expo-haptics: For haptic feedback
 *
 * @returns
 * - animatedStyle: Animated style object for the component
 * - handlePressIn: Handler for press in event
 * - handlePressOut: Handler for press out event
 */
import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface UseAnimatedPressOptions {
  scaleValue?: number;
  duration?: number;
  hapticFeedback?: boolean;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
}

export const useAnimatedPress = (options: UseAnimatedPressOptions = {}) => {
  const {
    scaleValue = 0.95,
    duration = 100,
    hapticFeedback = true,
    hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  } = options;

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(scaleValue, { duration });
    if (hapticFeedback) {
      Haptics.impactAsync(hapticStyle);
    }
  }, [scale, scaleValue, duration, hapticFeedback, hapticStyle]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: duration + 50 });
  }, [scale, duration]);

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
};
