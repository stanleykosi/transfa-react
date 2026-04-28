import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/back.svg';
import LampIcon from '@/assets/icons/lamp-on.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthCreatePinProps {
  onNext: (pin: string) => void;
  onBack?: () => void;
}

export default function AuthCreatePin({ onNext, onBack }: AuthCreatePinProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState(['', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handlePinChange = useCallback(
    (value: string, index: number) => {
      const cleaned = value.replace(/[^0-9]/g, '');
      if (!cleaned && value !== '') return;

      const nextPin = [...pin];

      if (cleaned.length > 1) {
        const digits = cleaned.split('').slice(0, 4);
        digits.forEach((d, i) => {
          nextPin[i] = d;
        });
        setPin(nextPin);
        const focusIdx = Math.min(digits.length, 3);
        inputRefs.current[focusIdx]?.focus();
        return;
      }

      nextPin[index] = cleaned;
      setPin(nextPin);

      if (cleaned && index < 3) {
        inputRefs.current[index + 1]?.focus();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [pin]
  );

  const handleKeyPress = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
      if (nativeEvent.key === 'Backspace') {
        if (!pin[index] && index > 0) {
          const nextPin = [...pin];
          nextPin[index - 1] = '';
          setPin(nextPin);
          inputRefs.current[index - 1]?.focus();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    },
    [pin]
  );

  const handleNext = useCallback(() => {
    const fullPin = pin.join('');
    if (fullPin.length === 4) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onNext(fullPin);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [pin, onNext]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  }, [onBack]);

  const isPinComplete = pin.every((digit) => digit !== '');

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + verticalScale(20),
              paddingBottom: insets.bottom + verticalScale(20),
            },
          ]}
        >
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressedOpacity]}
              onPress={handleBack}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <SvgAsset source={BackIcon} width={scale(24)} height={scale(24)} />
            </Pressable>
          )}

          <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
            <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
            <Text style={styles.title}>Create Pin</Text>
            <Text style={styles.instructions}>
              Please enter a secure 4 digit pin to carry out your transactions.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.pinContainer}>
            {pin.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.pinInput, focusedIndex === index && styles.pinInputFocused]}
                value={digit}
                onChangeText={(val) => handlePinChange(val, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                keyboardAppearance="dark"
                maxLength={1}
                textAlign="center"
                placeholderTextColor="rgba(255, 255, 255, 0.15)"
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(null)}
                secureTextEntry={true}
                cursorColor="#FFD300"
                selectionColor="rgba(255, 211, 0, 0.3)"
              />
            ))}
          </Animated.View>

          <View style={styles.spacer} />

          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Pressable
              style={({ pressed }) => [
                globalStyles.primaryButtonWithMargin,
                styles.nextButton,
                !isPinComplete && styles.buttonDisabled,
                isPinComplete && pressed && styles.buttonPressed,
              ]}
              onPress={handleNext}
              disabled={!isPinComplete}
            >
              <Text style={globalStyles.primaryButtonText}>Next</Text>
            </Pressable>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.duration(400).delay(400)}
            style={styles.securityTipsContainer}
          >
            <View style={styles.securityTipsHeader}>
              <SvgAsset source={LampIcon} width={scale(24)} height={scale(24)} />
              <Text style={styles.securityTipsTitle}>Security Tips</Text>
            </View>

            <View style={styles.tipsList}>
              <View style={styles.tipItem}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>Use a unique PIN</Text>
              </View>
              <View style={styles.tipItem}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>Avoid obvious numbers like 1234 or your birthday</Text>
              </View>
              <View style={styles.tipItem}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>Never share your PIN with anyone</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: scale(20),
    zIndex: 1,
  },
  backButton: {
    marginBottom: verticalScale(20),
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(40),
  },
  title: {
    fontSize: moderateScale(36),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: verticalScale(8),
    fontFamily: 'ArtificTrial-Semibold',
  },
  instructions: {
    maxWidth: scale(200),
    fontSize: moderateScale(20),
    textAlign: 'center',
    color: '#6C6B6B',
    lineHeight: moderateScale(22),
    fontFamily: 'Montserrat_400Regular',
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: scale(18),
    alignSelf: 'center',
  },
  pinInput: {
    width: scale(56),
    height: scale(64),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: scale(10),
    borderCurve: 'continuous',
    fontSize: moderateScale(24),
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    fontFamily: 'Montserrat_700Bold',
    overflow: 'hidden',
  },
  pinInputFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  spacer: {
    height: verticalScale(30),
  },
  securityTipsContainer: {
    marginTop: verticalScale(20),
    padding: scale(20),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  securityTipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
    gap: scale(10),
  },
  securityTipsTitle: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
  },
  tipsList: {
    gap: verticalScale(12),
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: scale(4),
  },
  bullet: {
    width: scale(3),
    height: scale(3),
    borderRadius: scale(1.5),
    backgroundColor: '#6C6B6B',
    marginTop: verticalScale(9),
    marginRight: scale(12),
  },
  tipText: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF50',
    lineHeight: moderateScale(20),
    fontFamily: 'Montserrat_400Regular',
  },
  nextButton: {
    width: '80%',
    alignSelf: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});
