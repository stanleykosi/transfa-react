import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSignIn } from '@/hooks/useSignIn';
import { fetchAuthSession } from '@/api/authApi';
import { AuthStackParamList } from '@/navigation/AuthStack';

const REMEMBER_ME_KEY = 'auth.remember_me';
const REMEMBERED_IDENTIFIER_KEY = 'auth.remembered_identifier';

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const SignInScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigation = useNavigation<AuthNavigation>();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadRememberedIdentity = async () => {
      try {
        const storedRememberMe = await loadStoredValue(REMEMBER_ME_KEY);
        const enabled = storedRememberMe !== 'false';
        const storedIdentifier = await loadStoredValue(REMEMBERED_IDENTIFIER_KEY);

        if (!mounted) {
          return;
        }

        setRememberMe(enabled);
        if (enabled && storedIdentifier) {
          setIdentifier(storedIdentifier);
        }
      } catch {
        // Ignore storage failures. Login should still function.
      }
    };

    loadRememberedIdentity();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => identifier.trim() !== '' && password.trim() !== '',
    [identifier, password]
  );

  const persistRememberedIdentifier = async (value: string, shouldRemember: boolean) => {
    await storeValue(REMEMBER_ME_KEY, shouldRemember ? 'true' : 'false');
    if (shouldRemember) {
      await storeValue(REMEMBERED_IDENTIFIER_KEY, value.trim());
      return;
    }
    await deleteValue(REMEMBERED_IDENTIFIER_KEY);
  };

  const onSignInPress = async () => {
    if (!isLoaded || !canSubmit) {
      return;
    }

    setIsLoading(true);
    try {
      const completeSignIn = await signIn.create({
        identifier: identifier.trim(),
        password,
      });

      if (completeSignIn.status === 'complete' && completeSignIn.createdSessionId) {
        await setActive({ session: completeSignIn.createdSessionId });
        await persistRememberedIdentifier(identifier, rememberMe);

        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn('Auth bootstrap check failed after sign-in', bootstrapError);
        }
        return;
      }

      if (completeSignIn.status === 'needs_second_factor') {
        const emailFactor = Array.isArray((completeSignIn as any)?.supportedSecondFactors)
          ? (completeSignIn as any).supportedSecondFactors.find(
              (factor: any) =>
                factor?.strategy === 'email_code' && typeof factor?.emailAddressId === 'string'
            )
          : null;

        if (!emailFactor?.emailAddressId) {
          Alert.alert(
            'Verification required',
            'This account needs a second verification step that is not yet configured in this app.'
          );
          return;
        }

        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });
        await persistRememberedIdentifier(identifier, rememberMe);

        navigation.navigate('VerifyCode', {
          emailAddressId: emailFactor.emailAddressId,
        });
        return;
      }

      Alert.alert('Sign in incomplete', 'Additional verification is required to continue.');
    } catch (err: any) {
      Alert.alert(
        'Login failed',
        err?.errors?.[0]?.message || 'Unable to sign in with these credentials.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotPasswordPress = async () => {
    setIsResetLoading(true);
    try {
      navigation.navigate('ForgotPassword', {
        identifier: identifier.trim() || undefined,
      });
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Login to Transfa</Text>
              <Text style={styles.subtitle}>Hi! Welcome back</Text>

              <View style={styles.formSection}>
                <Text style={styles.label}>Username or Email or Phone number</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-circle-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="Username or Email or Phone number"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    keyboardType="default"
                    textContentType="username"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <TouchableOpacity
                    onPress={onForgotPasswordPress}
                    activeOpacity={0.7}
                    disabled={isResetLoading}
                  >
                    <Text style={styles.forgotPasswordText}>
                      {isResetLoading ? 'Sending...' : 'Forgot Password?'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    secureTextEntry={!isPasswordVisible}
                    textContentType="password"
                  />
                  <TouchableOpacity
                    onPress={() => setIsPasswordVisible((prev) => !prev)}
                    activeOpacity={0.7}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color="#9B9B9B"
                    />
                  </TouchableOpacity>
                </View>

                <Pressable
                  style={styles.rememberRow}
                  onPress={() => setRememberMe((prev) => !prev)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberMe }}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <Ionicons name="checkmark" size={12} color="#050505" />}
                  </View>
                  <Text style={styles.rememberText}>Remember Me</Text>
                </Pressable>

                <TouchableOpacity
                  style={[
                    styles.loginButton,
                    (!canSubmit || isLoading) && styles.loginButtonDisabled,
                  ]}
                  onPress={onSignInPress}
                  activeOpacity={0.85}
                  disabled={!canSubmit || isLoading}
                >
                  <Text style={styles.loginButtonText}>
                    {isLoading ? 'Logging in...' : 'Log In'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.signUpRow}
                  onPress={() => navigation.navigate('SignUp')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.signUpText}>
                    Do not have an account? <Text style={styles.signUpAccent}>Sign Up</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const storeValue = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    const localStorageRef = (globalThis as any)?.localStorage;
    if (localStorageRef) {
      localStorageRef.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const loadStoredValue = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    const localStorageRef = (globalThis as any)?.localStorage;
    if (!localStorageRef) {
      return null;
    }
    return localStorageRef.getItem(key);
  }
  return SecureStore.getItemAsync(key);
};

const deleteValue = async (key: string) => {
  if (Platform.OS === 'web') {
    const localStorageRef = (globalThis as any)?.localStorage;
    if (localStorageRef) {
      localStorageRef.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  gradient: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
  },
  logoMark: {
    width: 42,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#FFD300',
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  logoSlash: {
    position: 'absolute',
    width: 60,
    height: 11,
    backgroundColor: '#0A0A0A',
    transform: [{ rotate: '-12deg' }],
    top: 4,
    right: -17,
  },
  logoBottomMark: {
    width: 8,
    height: 6,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    backgroundColor: '#0A0A0A',
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: {
    color: '#F4F4F4',
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#6E6E6E',
    fontSize: 30,
    fontWeight: '500',
    marginTop: 4,
  },
  formSection: {
    width: '100%',
    marginTop: 56,
  },
  label: {
    color: '#D7D7D7',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 79, 79, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  textInput: {
    flex: 1,
    color: '#E9E9E9',
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: '#D2B108',
    fontSize: 15,
    fontWeight: '600',
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  checkbox: {
    width: 15,
    height: 15,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#FFD300',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FFD300',
  },
  rememberText: {
    color: '#CDCDCD',
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '500',
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: '#FFD300',
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
  },
  signUpRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  signUpText: {
    color: '#C5C5C5',
    fontSize: 15,
    fontWeight: '500',
  },
  signUpAccent: {
    color: '#D2B108',
    fontWeight: '700',
  },
});

export default SignInScreen;
