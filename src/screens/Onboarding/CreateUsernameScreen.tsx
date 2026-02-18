import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';
import { submitUsernameSetup } from '@/api/authApi';
import { USERNAME_REGEX, normalizeUsername } from '@/utils/username';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreateUsername'>;

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const CreateUsernameScreen = () => {
  const navigation = useNavigation<Navigation>();
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedUsername = useMemo(
    () =>
      normalizeUsername(username)
        .toLowerCase()
        .replace(/[^a-z0-9._]/g, ''),
    [username]
  );

  const onSubmit = async () => {
    if (isSubmitting) {
      return;
    }
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      Alert.alert('Invalid username', 'Use 3-20 lowercase letters, numbers, dot or underscore.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitUsernameSetup({ username: normalizedUsername });
      navigation.navigate('CreatePin');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        Alert.alert('Username unavailable', 'Try another username.');
      } else if (status === 412) {
        Alert.alert(
          'Account setup in progress',
          'Please wait while we finish provisioning your account.'
        );
      } else {
        Alert.alert(
          'Unable to save username',
          error?.response?.data?.detail ||
            error?.response?.data?.error ||
            'Please try again in a moment.'
        );
      }
    } finally {
      setIsSubmitting(false);
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
              activeOpacity={0.7}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }
                navigation.dispatch(StackActions.replace('CreateAccount'));
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Create Username</Text>
              <Text style={styles.subtitle}>
                Please enter your unique Username{'\n'}to send and receive money
              </Text>

              <View style={styles.formSection}>
                <View style={styles.inputWrapper}>
                  <Ionicons name="at" size={18} color="#B6B6B6" />
                  <TextInput
                    style={styles.textInput}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Huncho25_"
                    placeholderTextColor="#737373"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                  onPress={onSubmit}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSubmitting ? 'Saving...' : 'Next'}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08090A',
  },
  gradient: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 34,
  },
  logoMark: {
    width: 42,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#FFD300',
    overflow: 'hidden',
    marginBottom: 20,
  },
  logoSlash: {
    position: 'absolute',
    right: 7,
    top: -5,
    width: 18,
    height: 18,
    backgroundColor: '#060708',
    transform: [{ rotate: '32deg' }],
  },
  logoBottomMark: {
    position: 'absolute',
    left: 15,
    bottom: 2,
    width: 9,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#060708',
  },
  title: {
    fontSize: 43,
    color: '#F1F1F1',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#4E5157',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
  },
  formSection: {
    width: '100%',
    marginTop: 42,
    gap: 22,
  },
  inputWrapper: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#323232',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: '#ECECEC',
    fontSize: 16,
    fontWeight: '500',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});

export default CreateUsernameScreen;
