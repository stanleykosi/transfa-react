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
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/back.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthCreateUsernameProps {
  onNext: (username: string) => void;
  onBack?: () => void;
  initialUsername?: string;
  isSubmitting?: boolean;
}

export default function AuthCreateUsername({
  onNext,
  onBack,
  initialUsername = '',
  isSubmitting = false,
}: AuthCreateUsernameProps) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(initialUsername);
  const [focusedInput, setFocusedInput] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (initialUsername) {
      setUsername(initialUsername);
    }
  }, [initialUsername]);

  const handleNext = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onNext(trimmedUsername);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [isSubmitting, username, onNext]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  }, [onBack]);

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
            <Text style={styles.title}>Create Username</Text>
            <Text style={styles.subtitle}>
              Please enter your unique Username to send and receive money.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.inputContainer}>
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={[styles.inputWrapper, focusedInput && styles.inputWrapperFocused]}
            >
              <Text style={styles.atSymbol}>@</Text>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Huncho25_"
                placeholderTextColor="rgba(255, 255, 255, 0.32)"
                value={username}
                onChangeText={(val) => setUsername(val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                keyboardAppearance="dark"
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                maxLength={30}
                onFocus={() => setFocusedInput(true)}
                onBlur={() => setFocusedInput(false)}
                returnKeyType="done"
                onSubmitEditing={handleNext}
              />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Pressable
              style={({ pressed }) => [
                globalStyles.primaryButtonWithMargin,
                isSubmitting && styles.buttonDisabled,
                pressed && !isSubmitting && styles.buttonPressed,
              ]}
              onPress={handleNext}
              disabled={isSubmitting}
            >
              <Text style={globalStyles.primaryButtonText}>
                {isSubmitting ? 'Saving...' : 'Next'}
              </Text>
            </Pressable>
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
  subtitle: {
    maxWidth: scale(260),
    fontSize: moderateScale(18),
    textAlign: 'center',
    color: '#6C6B6B',
    lineHeight: moderateScale(22),
    fontFamily: 'Montserrat_400Regular',
  },
  inputContainer: {
    marginBottom: verticalScale(24),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: scale(10),
    borderCurve: 'continuous',
    paddingHorizontal: scale(16),
    height: verticalScale(56),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  atSymbol: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
    marginRight: scale(10),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});
