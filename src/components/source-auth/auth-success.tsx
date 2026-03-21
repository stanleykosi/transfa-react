import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthSuccessProps {
  onComplete: () => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
}

export default function AuthSuccess({
  onComplete,
  title = 'Success!',
  subtitle = 'Profile created successfully.',
}: AuthSuccessProps) {
  const scaleValue = useSharedValue(0.5);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    scaleValue.value = withSpring(1, {
      damping: 12,
      stiffness: 100,
    });

    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete, scaleValue]);

  const illustrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Success Illustration with Pop Animation */}
        <Animated.View style={[styles.illustrationContainer, illustrationStyle]}>
          <Image
            source={require('@/assets/images/success-confetti.png')}
            style={styles.successImage}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.textContainer}>
          <Animated.Text entering={FadeInUp.duration(600).delay(300)} style={styles.title}>
            {title}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.duration(600).delay(500)} style={styles.subtitle}>
            {subtitle}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(40),
    zIndex: 1,
  },
  illustrationContainer: {
    alignItems: 'center',
  },
  successImage: {
    width: scale(267),
    height: scale(267),
  },
  textContainer: {
    alignItems: 'center',
    marginTop: -verticalScale(60),
    zIndex: 2,
  },
  title: {
    fontSize: moderateScale(36),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: verticalScale(12),
    fontFamily: 'ArtificTrial-Semibold',
  },
  subtitle: {
    fontSize: moderateScale(20),
    textAlign: 'center',
    color: '#6C6B6B',
    lineHeight: moderateScale(26),
    fontFamily: 'Montserrat_400Regular',
  },
});
