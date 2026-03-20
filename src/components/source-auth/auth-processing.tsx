import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthProcessingProps {
  onComplete: () => void;
  onBack?: () => void;
}

export default function AuthProcessing({ onComplete }: AuthProcessingProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(800)} style={styles.illustrationContainer}>
          <Image
            source={require('@/assets/images/process.png')}
            style={styles.processingImage}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.textContainer}>
          <Animated.Text entering={FadeInUp.duration(600).delay(200)} style={styles.title}>
            Processing...
          </Animated.Text>
          <Animated.Text entering={FadeInUp.duration(600).delay(400)} style={styles.subtitle}>
            Hanging tight, we&apos;re finishing up your setup
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
    marginBottom: verticalScale(40),
  },
  processingImage: {
    width: scale(130),
    height: scale(109),
  },
  textContainer: {
    alignItems: 'center',
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
