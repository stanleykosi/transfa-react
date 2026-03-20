import React from 'react';
import Animated, { FadeInLeft, FadeOutRight } from 'react-native-reanimated';

interface AnimatedPageWrapperProps {
  children: React.ReactNode;
}

const entering = FadeInLeft.duration(10).springify().damping(34).stiffness(200);

const exiting = FadeOutRight.duration(10);

export default function AnimatedPageWrapper({ children }: AnimatedPageWrapperProps) {
  return (
    <Animated.View style={{ flex: 1 }} entering={entering} exiting={exiting}>
      {children}
    </Animated.View>
  );
}
