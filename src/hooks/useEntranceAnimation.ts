/**
 * @description
 * Custom hook for entrance animations. Creates a smooth fade-in and slide-up
 * animation when component mounts.
 *
 * @dependencies
 * - react-native-reanimated: For performant animations
 *
 * @params
 * - delay: Optional delay before animation starts (ms)
 * - duration: Animation duration (ms)
 *
 * @returns
 * - animatedStyle: Animated style object for the component
 */
import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface UseEntranceAnimationOptions {
  delay?: number;
  duration?: number;
  translateY?: number;
}

export const useEntranceAnimation = (options: UseEntranceAnimationOptions = {}) => {
  const { delay = 0, duration = 500, translateY = 50 } = options;

  const opacity = useSharedValue(0);
  const translateYValue = useSharedValue(translateY);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateYValue.value }],
  }));

  useEffect(() => {
    const animation = () => {
      opacity.value = withDelay(
        delay,
        withTiming(1, {
          duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );
      translateYValue.value = withDelay(
        delay,
        withTiming(0, {
          duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );
    };

    animation();
  }, [delay, duration, opacity, translateYValue]);

  return { animatedStyle };
};
