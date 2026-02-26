import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '@/constants/theme';

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

interface PinStepTemplateProps {
  title: string;
  subtitle: string;
  buttonLabel: string;
  onSubmit: (pin: string) => void;
  loading?: boolean;
  errorMessage?: string | null;
}

const PinStepTemplate = ({
  title,
  subtitle,
  buttonLabel,
  onSubmit,
  loading,
  errorMessage,
}: PinStepTemplateProps) => {
  const navigation = useNavigation();
  const inputRef = useRef<TextInput | null>(null);
  const [pin, setPin] = useState('');

  const onChange = (value: string) => {
    setPin(value.replace(/[^0-9]/g, '').slice(0, 4));
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Pressable style={styles.pinRow} onPress={() => inputRef.current?.focus()}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[styles.pinBox, errorMessage ? styles.pinBoxError : undefined]}
              >
                <Text style={styles.pinText}>{pin[index] ? '•' : '-'}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={pin}
            onChangeText={onChange}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            autoFocus
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity
            style={[styles.nextButton, (pin.length !== 4 || loading) && styles.nextButtonDisabled]}
            disabled={pin.length !== 4 || loading}
            onPress={() => onSubmit(pin)}
          >
            <Text style={styles.nextButtonText}>{loading ? 'Please wait...' : buttonLabel}</Text>
          </TouchableOpacity>

          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb" size={18} color={BRAND_YELLOW} />
              <Text style={styles.tipsTitle}>Security Tips</Text>
            </View>
            <Text style={styles.tipText}>• Use a unique PIN</Text>
            <Text style={styles.tipText}>• Avoid obvious numbers like 1234 or your birthday</Text>
            <Text style={styles.tipText}>• Never share your PIN with anyone</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.s20,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 70,
    color: '#F2F2F2',
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#72757D',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  pinRow: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  pinBox: {
    width: 46,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxError: {
    borderColor: '#FF3B30',
  },
  pinText: {
    color: '#D4D6DA',
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.medium,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorText: {
    marginTop: 10,
    color: '#FF3B30',
    textAlign: 'center',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  nextButton: {
    marginTop: 24,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: '#111214',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  tipsCard: {
    marginTop: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tipsTitle: {
    color: '#ECECED',
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  tipText: {
    color: '#8E9197',
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginTop: 3,
  },
});

export default PinStepTemplate;
