import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

interface AuthVerifyCodeProps {
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  email: string;
  isVerifying?: boolean;
}

export default function AuthVerifyCode({
  onVerify,
  onResend,
  onBack,
  email: _email,
  isVerifying = false,
}: AuthVerifyCodeProps) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [focusedInput, setFocusedInput] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const performVerification = useCallback(
    (fullCode: string) => {
      if (isVerifying) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onVerify(fullCode);
    },
    [isVerifying, onVerify]
  );

  const handleCodeChange = useCallback(
    (value: string, index: number) => {
      if (isVerifying) return;

      const numericValue = value.replace(/[^0-9]/g, '');

      if (numericValue.length > 1) {
        const newCode = ['', '', '', '', '', ''];
        const digits = numericValue.split('').slice(0, 6);
        digits.forEach((digit, i) => {
          if (i < 6) newCode[i] = digit;
        });
        setCode(newCode);

        const lastFilledIndex = Math.min(digits.length - 1, 5);
        inputRefs.current[lastFilledIndex]?.focus();

        if (digits.length === 6 && newCode.every((d) => d !== '')) {
          performVerification(newCode.join(''));
        }
        return;
      }

      const newCode = [...code];
      newCode[index] = numericValue;
      setCode(newCode);

      if (numericValue && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      if (numericValue && index === 5) {
        const fullCode = [...newCode];
        fullCode[index] = numericValue;
        if (fullCode.every((d) => d !== '')) {
          performVerification(fullCode.join(''));
        }
      }
    },
    [code, isVerifying, performVerification]
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (isVerifying) return;

      if (key === 'Backspace' || key === 'Delete') {
        const newCode = [...code];
        if (newCode[index]) {
          newCode[index] = '';
          setCode(newCode);
        } else if (index > 0) {
          newCode[index - 1] = '';
          setCode(newCode);
          inputRefs.current[index - 1]?.focus();
        }
      }
    },
    [code, isVerifying]
  );

  const handleVerify = useCallback(() => {
    const fullCode = code.join('');
    if (fullCode.length === 6 && !isVerifying) {
      performVerification(fullCode);
    }
  }, [code, isVerifying, performVerification]);

  const handleResend = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onResend();
  }, [onResend]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + verticalScale(20),
            paddingBottom: insets.bottom + verticalScale(20),
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressedOpacity]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <SvgAsset source={BackIcon} width={scale(24)} height={scale(24)} />
        </Pressable>

        <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
          <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
          <Text style={styles.title}>Verify Code</Text>
          <Text style={styles.instructions}>Please enter the code we just sent to your email</Text>
          {/* {email ? <Text style={styles.emailText}>{email}</Text> : null} */}
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.codeInput,
                focusedInput === index && styles.codeInputFocused,
                isVerifying && styles.codeInputDisabled,
              ]}
              value={digit}
              onChangeText={(value) => handleCodeChange(value, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={Platform.OS === 'android' ? 1 : 1}
              textContentType="oneTimeCode"
              textAlign="center"
              placeholder="-"
              placeholderTextColor="rgba(255, 255, 255, 0.32)"
              onFocus={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFocusedInput(index);
              }}
              onBlur={() => setFocusedInput(null)}
              editable={!isVerifying}
            />
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(300)}>
          <Pressable
            style={({ pressed }) => [
              globalStyles.primaryButtonWithMargin,
              isVerifying ? styles.buttonDisabled : null,
              pressed && !isVerifying && styles.buttonPressed,
            ]}
            onPress={handleVerify}
            disabled={isVerifying}
          >
            {isVerifying ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#000000" size="small" />
                <Text style={[globalStyles.primaryButtonText, styles.loadingText]}>
                  Verifying...
                </Text>
              </View>
            ) : (
              <Text style={globalStyles.primaryButtonText}>Verify</Text>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(350)} style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn&apos;t recieve OTP?</Text>
          <Pressable onPress={handleResend}>
            <Text style={styles.resendLink}>Resend Code</Text>
          </Pressable>
        </Animated.View>
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
    maxWidth: scale(260),
    fontSize: moderateScale(20),
    textAlign: 'center',
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: verticalScale(8),
  },
  emailText: {
    fontSize: moderateScale(16),
    textAlign: 'center',
    color: '#FFD300',
    fontFamily: 'Montserrat_400Regular',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: verticalScale(32),
    gap: scale(10),
  },
  codeInput: {
    flex: 1,
    height: verticalScale(60),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: scale(8),
    borderCurve: 'continuous',
    fontSize: moderateScale(24),
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  codeInputFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  codeInputDisabled: {
    opacity: 0.5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: scale(8),
  },
  resendContainer: {
    alignItems: 'center',
  },
  resendText: {
    fontSize: moderateScale(16),
    color: '#ffffff',
    marginBottom: verticalScale(8),
    fontFamily: 'Montserrat_400Regular',
  },
  resendLink: {
    fontSize: moderateScale(16),
    color: '#FFD300',
    textDecorationLine: 'underline',
    fontFamily: 'Montserrat_400Regular',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});
