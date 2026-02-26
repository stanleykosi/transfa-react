import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'LinkAccountPin'>;

const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const LinkAccountPinScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [pin, setPin] = useState('');
  const pinRef = useRef<TextInput | null>(null);
  const setLinkAccountPin = useSensitiveFlowStore((state) => state.setLinkAccountPin);
  const clearLinkAccountPin = useSensitiveFlowStore((state) => state.clearLinkAccountPin);

  useEffect(() => {
    clearLinkAccountPin();
  }, [clearLinkAccountPin]);

  const onPinChange = (value: string) => {
    const next = value.replace(/[^0-9]/g, '').slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setLinkAccountPin(next);
      navigation.replace('AddBeneficiary');
    }
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

          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>Enter Pin to link new account</Text>

          <Pressable style={styles.pinRow} onPress={() => pinRef.current?.focus()}>
            {[0, 1, 2, 3].map((index) => (
              <View key={index} style={styles.pinBox}>
                <Text style={styles.pinText}>{pin[index] ? '•' : '-'}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={pinRef}
            style={styles.hiddenInput}
            value={pin}
            onChangeText={onPinChange}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            autoFocus
          />
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
    marginTop: 76,
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
    marginTop: 26,
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
  pinText: {
    color: '#C8CAD0',
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.medium,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default LinkAccountPinScreen;
