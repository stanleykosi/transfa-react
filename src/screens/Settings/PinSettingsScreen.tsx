import React from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { fetchSecurityStatus } from '@/api/authApi';
import { AppStackParamList } from '@/navigation/AppStack';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinSettings'>;

const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const PinSettingsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const clearPinChangeFlow = useSensitiveFlowStore((state) => state.clearPinChangeFlow);
  const {
    data: securityStatus,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['security-status'],
    queryFn: fetchSecurityStatus,
  });

  const isPinSet = securityStatus?.transaction_pin_set ?? false;

  const openPinFlow = () => {
    clearPinChangeFlow();

    if (!securityStatus) {
      Alert.alert('Unable to verify PIN status', 'Please try again in a moment.');
      return;
    }

    if (!isPinSet) {
      const rootNavigation = navigation
        .getParent()
        ?.getParent() as NativeStackNavigationProp<AppStackParamList> | null;

      if (rootNavigation) {
        rootNavigation.navigate('CreatePin');
        return;
      }

      Alert.alert('Unable to open PIN setup', 'Please try again from the main dashboard.');
      return;
    }

    navigation.navigate('PinOtp');
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

          <Text style={styles.title}>Pin</Text>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#FFD400" />
            </View>
          ) : null}

          <TouchableOpacity style={styles.row} onPress={openPinFlow} disabled={isLoading}>
            <Text style={styles.rowText}>
              {isPinSet ? 'Change Transfa Pin' : 'Set Transfa Pin'}
            </Text>
          </TouchableOpacity>

          {error ? <Text style={styles.helperText}>Unable to refresh PIN status.</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090A0B' },
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.s20 },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 16,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  rowText: {
    color: '#EDEDED',
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
  },
  loadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  helperText: {
    marginTop: 8,
    color: '#9EA1A7',
    fontSize: fontSizes.sm,
  },
});

export default PinSettingsScreen;
