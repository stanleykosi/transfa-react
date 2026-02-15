import React, { useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreatePin'>;

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const toPin = (value: string) => value.replace(/\D/g, '').slice(0, 4);

const CreatePinScreen = () => {
  const navigation = useNavigation<Navigation>();
  const hiddenInputRef = useRef<TextInput>(null);
  const [pin, setPin] = useState('');

  const digits = useMemo(() => {
    const values = pin.split('');
    return [values[0] || '', values[1] || '', values[2] || '', values[3] || ''];
  }, [pin]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.dispatch(StackActions.replace('CreateUsername'));
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.content}>
            <TransfaMark />
            <Text style={styles.title}>Create Pin</Text>
            <Text style={styles.subtitle}>
              Please enter a secure 4 digit pin{'\n'}to carry out your transactions.
            </Text>

            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              value={pin}
              onChangeText={(value) => setPin(toPin(value))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              caretHidden
            />

            <TouchableOpacity
              style={styles.pinRow}
              activeOpacity={1}
              onPress={() => hiddenInputRef.current?.focus()}
            >
              {digits.map((digit, index) => (
                <View key={index} style={styles.pinBox}>
                  <Text style={styles.pinText}>{digit || ''}</Text>
                </View>
              ))}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, pin.length !== 4 && styles.primaryButtonDisabled]}
              activeOpacity={0.85}
              disabled={pin.length !== 4}
              onPress={() => navigation.navigate('ConfirmPin', { pin })}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>

            <View style={styles.tipsCard}>
              <View style={styles.tipsHeader}>
                <Ionicons name="bulb" size={18} color="#FFD300" />
                <Text style={styles.tipsTitle}>Security Tips</Text>
              </View>
              <Text style={styles.tipText}>• Use a unique PIN</Text>
              <Text style={styles.tipText}>• Avoid obvious numbers like 1234 or your birthday</Text>
              <Text style={styles.tipText}>• Never share your PIN with anyone</Text>
            </View>
          </View>
        </View>
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
  container: {
    flex: 1,
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
  content: {
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
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  pinRow: {
    marginTop: 28,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
  },
  pinBox: {
    width: 54,
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: {
    color: '#D9D9D9',
    fontSize: 24,
    fontWeight: '500',
  },
  primaryButton: {
    marginTop: 26,
    width: '100%',
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tipsCard: {
    marginTop: 36,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    padding: 18,
    gap: 12,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipsTitle: {
    color: '#E6E6E6',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tipText: {
    color: '#5B5E63',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});

export default CreatePinScreen;
