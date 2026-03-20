import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Polygon, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';

import logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { SCREEN_WIDTH, moderateScale, scale, verticalScale } from '@/utils/responsive';

const mockImage = require('@/assets/images/mock.png');

// Spotlight and vignette dimensions scale with the screen
const TRIANGLE_GLOW_HEIGHT = verticalScale(500);
const TRIANGLE_TOP_WIDTH = SCREEN_WIDTH * 0.7;
const TOP_GLOW_ANIMATION_DURATION = 800;
const TOP_GLOW_TRANSLATE_OFFSET = verticalScale(-40);
const BOTTOM_VIGNETTE_HEIGHT = verticalScale(500);

// This CSS gradient keeps the bottom of the screen nice and dark for text readability
const BOTTOM_VIGNETTE_GRADIENT =
  'linear-gradient(to bottom, rgba(18, 22, 21, 0) 0%, rgba(18, 22, 21, 0.02) 10%, rgba(18, 22, 21, 0.08) 20%, rgba(18, 22, 21, 0.2) 30%, rgba(18, 22, 21, 0.4) 45%, rgba(18, 22, 21, 0.7) 60%, rgba(18, 22, 21, 0.9) 75%, rgba(18, 22, 21, 1) 90%)';

// Timing for the text and button transitions between steps
const STEP_ANIMATION_DURATION = 300;
const STAGGER_DELAY = 80;

interface OnboardingStep {
  title: string;
  description: string;
  buttonText: string;
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: 'Welcome to Transfa',
    description:
      "Fast, secure payments—whether you're sending money to friends or getting paid for your business.",
    buttonText: 'Next',
  },
  {
    title: 'Simple QR Magic',
    description: 'Every user has a QR code for instant payments. No bank details. No fuss.',
    buttonText: 'Next',
  },
  {
    title: 'Your Money, Fully Protected',
    description:
      'Built on Anchor BaaS, every transaction is encrypted and safeguarded with advanced security.',
    buttonText: 'Get Started',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Reanimated values for the opening animation
  const topGlowOpacity = useSharedValue(0);
  const topGlowTranslateY = useSharedValue(TOP_GLOW_TRANSLATE_OFFSET);

  // Handles the spotlight sliding in and fading on first mount
  useEffect(() => {
    topGlowOpacity.value = withTiming(1, {
      duration: TOP_GLOW_ANIMATION_DURATION,
      easing: Easing.out(Easing.ease),
    });
    topGlowTranslateY.value = withTiming(0, {
      duration: TOP_GLOW_ANIMATION_DURATION,
      easing: Easing.out(Easing.ease),
    });
  }, [topGlowOpacity, topGlowTranslateY]);

  const topGlowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topGlowOpacity.value,
    transform: [{ translateY: topGlowTranslateY.value }],
  }));

  const handleNext = useCallback(() => {
    if (isTransitioning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentStep < onboardingSteps.length - 1) {
      setIsTransitioning(true);
      // Give the current step a moment to fade out before we swap the content
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        setIsTransitioning(false);
      }, STEP_ANIMATION_DURATION);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    }
  }, [currentStep, isTransitioning, onComplete]);

  const currentStepData = onboardingSteps[currentStep];

  // Trapezoid math for the top spotlight
  const topLeftX = (SCREEN_WIDTH - TRIANGLE_TOP_WIDTH) / 2;
  const topRightX = topLeftX + TRIANGLE_TOP_WIDTH;
  const bottomLeftX = 0;
  const bottomRightX = SCREEN_WIDTH;

  return (
    <View style={styles.rootContainer}>
      <View style={styles.blackBackground} />

      {/* Top spotlight glow */}
      <Animated.View
        style={[styles.triangleGlowContainer, topGlowAnimatedStyle]}
        pointerEvents="none"
      >
        <Svg
          width={SCREEN_WIDTH}
          height={TRIANGLE_GLOW_HEIGHT}
          viewBox={`0 0 ${SCREEN_WIDTH} ${TRIANGLE_GLOW_HEIGHT}`}
        >
          <Defs>
            <SvgLinearGradient id="triangleGlow" x1="0.5" y1="0" x2="0.5" y2="1">
              {/* This is the bright center of the shine at the top */}
              <Stop offset="0%" stopColor="#FEF3A9" stopOpacity="0.18" />
              <Stop offset="5%" stopColor="#FEF3A9" stopOpacity="0.16" />
              <Stop offset="12%" stopColor="#FEF5B8" stopOpacity="0.13" />
              <Stop offset="20%" stopColor="#FEF6C0" stopOpacity="0.10" />
              {/* Gentle fade-off through the middle of the screen */}
              <Stop offset="30%" stopColor="#FEF7C8" stopOpacity="0.07" />
              <Stop offset="40%" stopColor="#FEF8D0" stopOpacity="0.04" />
              <Stop offset="50%" stopColor="#FEF9D8" stopOpacity="0.025" />
              {/* The final 'tail' of the light that disappears into total blackness */}
              <Stop offset="65%" stopColor="#FEFAE0" stopOpacity="0.012" />
              <Stop offset="80%" stopColor="#FEFCE8" stopOpacity="0.005" />
              <Stop offset="100%" stopColor="#FFFEF5" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Polygon
            points={`
              ${topLeftX},0
              ${topRightX},0
              ${bottomRightX},${TRIANGLE_GLOW_HEIGHT}
              ${bottomLeftX},${TRIANGLE_GLOW_HEIGHT}
            `}
            fill="url(#triangleGlow)"
          />
        </Svg>
      </Animated.View>

      {/* The image lives in its own layer, extending from below the progress bar
          all the way down behind the title area */}
      <Animated.View
        entering={FadeInUp.duration(700).delay(200)}
        style={[
          styles.illustrationLayer,
          {
            top: insets.top,
          },
        ]}
        pointerEvents="none"
      >
        <Image source={mockImage} style={styles.illustrationImage} resizeMode="contain" />
      </Animated.View>

      {/* This vignette sits over the image and creates a smooth fade into the text area */}
      <View style={styles.bottomVignette} pointerEvents="none" />

      {/* All the foreground content: logo, progress, title, button */}
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + verticalScale(20),
            paddingBottom: insets.bottom + verticalScale(20),
          },
        ]}
      >
        <View style={styles.content}>
          <Animated.View entering={FadeIn.duration(600)} style={styles.logoContainer}>
            <SvgAsset source={logo} width={49} height={23} />
          </Animated.View>

          <Animated.View layout={LinearTransition.duration(300)} style={styles.progressContainer}>
            {onboardingSteps.map((_, index) => (
              <Animated.View
                key={index}
                layout={LinearTransition.duration(300)}
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: index <= currentStep ? '#FFFFFF' : '#666666',
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/* This spacer pushes the text content to the bottom of the screen */}
          <View style={styles.spacer} />

          {/* Title and description — sits on top of the image thanks to zIndex */}
          <View style={styles.mainContent}>
            {!isTransitioning && (
              <Animated.View
                key={`step-${currentStep}`}
                entering={FadeInUp.duration(STEP_ANIMATION_DURATION).delay(0)}
                exiting={FadeOutUp.duration(STEP_ANIMATION_DURATION)}
                style={styles.stepTextContainer}
              >
                <Text style={styles.title}>{currentStepData.title}</Text>
              </Animated.View>
            )}
            {!isTransitioning && (
              <Animated.View
                key={`desc-${currentStep}`}
                entering={FadeInUp.duration(STEP_ANIMATION_DURATION).delay(STAGGER_DELAY)}
                exiting={FadeOutUp.duration(STEP_ANIMATION_DURATION)}
              >
                <Text style={styles.description}>{currentStepData.description}</Text>
              </Animated.View>
            )}
          </View>

          {!isTransitioning && (
            <Animated.View
              key={`btn-${currentStep}`}
              entering={FadeInDown.duration(STEP_ANIMATION_DURATION).delay(STAGGER_DELAY * 2)}
              exiting={FadeOut.duration(200)}
            >
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={handleNext}
              >
                <Text style={styles.buttonText}>{currentStepData.buttonText}</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blackBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  triangleGlowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TRIANGLE_GLOW_HEIGHT,
    zIndex: 1,
    alignItems: 'center',
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_VIGNETTE_HEIGHT,
    zIndex: 2,
    experimental_backgroundImage: BOTTOM_VIGNETTE_GRADIENT,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    zIndex: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: scale(20),
    // gap: verticalScale(1),
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: scale(8),
  },
  progressBar: {
    width: scale(64),
    height: verticalScale(4),
    borderRadius: 2,
    borderCurve: 'continuous',
  },
  illustrationLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  illustrationImage: {
    width: SCREEN_WIDTH * 1.0,
    height: SCREEN_WIDTH * 1.1 * (537 / 375),
  },
  spacer: {
    flex: 1,
  },
  mainContent: {
    alignItems: 'center',
  },
  stepTextContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: moderateScale(40),
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: moderateScale(42),
    fontFamily: 'ArtificTrial-Semibold',
  },
  description: {
    maxWidth: scale(300),
    fontSize: moderateScale(16),
    marginVertical: verticalScale(20),
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: moderateScale(22),
    fontFamily: 'Montserrat_400Regular',
  },
  button: {
    backgroundColor: '#FFD300',
    marginTop: verticalScale(16),
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(48),
    borderRadius: scale(10),
    borderCurve: 'continuous',
    alignSelf: 'center',
    minWidth: scale(300),
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: '#0E0F11',
    textAlign: 'center',
    fontFamily: 'Montserrat_700Bold',
  },
});
