import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinChangeSuccess'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const PinChangeSuccessScreen = () => {
  const navigation = useNavigation<NavigationProp>();

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
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={48} color="#121212" />
          </View>

          <Text style={styles.title}>PIN updated</Text>
          <Text style={styles.subtitle}>Your transaction PIN was changed successfully.</Text>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.navigate('ProfileHome')}
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090A0B' },
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.s20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    marginTop: 10,
    color: '#A8ABB0',
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 14,
  },
  doneButton: {
    marginTop: 28,
    minHeight: 52,
    minWidth: 220,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  doneText: {
    color: '#101214',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});

export default PinChangeSuccessScreen;
