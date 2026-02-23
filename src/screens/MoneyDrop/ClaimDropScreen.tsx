import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { useClaimMoneyDrop, useMoneyDropDetails } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

type ClaimDropScreenRouteProp = RouteProp<AppStackParamList, 'ClaimDrop'>;

const ClaimDropScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ClaimDropScreenRouteProp>();
  const { dropId } = route.params;
  const [lockPassword, setLockPassword] = useState('');

  const { data, isLoading, error } = useMoneyDropDetails(dropId);
  const { mutate: claimDrop, isPending } = useClaimMoneyDrop({
    onSuccess: (response) => {
      const backendMessage = response.message?.trim();
      const fallbackMessage = `You claimed ${formatCurrency(response.amount_claimed)} from ${normalizeUsername(response.creator_username)}.`;
      const message = backendMessage || fallbackMessage;
      const isPendingPayout = (backendMessage || '').toLowerCase().includes('processing');

      Alert.alert(isPendingPayout ? 'Claim Received' : 'Claim Successful', message, [
        {
          text: 'Done',
          onPress: () => navigation.navigate('AppTabs', { screen: 'Home' }),
        },
      ]);
    },
    onError: (claimError) => {
      Alert.alert('Claim Failed', claimError.message || 'Could not claim this money drop.');
    },
  });

  const onClaim = () => {
    if (!data) {
      return;
    }
    if (data.requires_password && lockPassword.trim().length === 0) {
      Alert.alert(
        'Password Required',
        'This money drop is locked. Enter the drop password to claim.'
      );
      return;
    }
    claimDrop({
      dropId,
      lockPassword: data.requires_password ? lockPassword.trim() : undefined,
    });
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
              <Text style={styles.statusText}>Loading money drop...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Ionicons name="warning-outline" size={34} color="#F59E0B" />
              <Text style={styles.statusTitle}>Could not load drop</Text>
              <Text style={styles.statusText}>{error.message}</Text>
            </View>
          ) : !data ? (
            <View style={styles.centerContent}>
              <Ionicons name="warning-outline" size={34} color="#F59E0B" />
              <Text style={styles.statusTitle}>Money drop unavailable</Text>
              <Text style={styles.statusText}>This money drop no longer exists.</Text>
            </View>
          ) : !data.is_claimable ? (
            <View style={styles.centerContent}>
              <Ionicons name="close-circle-outline" size={40} color="#EF4444" />
              <Text style={styles.statusTitle}>Cannot Claim</Text>
              <Text style={styles.statusText}>{data.message}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.headerTitle}>{data.title}</Text>
              <Text style={styles.headerSubtitle}>
                Sent by{' '}
                <Text style={styles.creatorName}>{normalizeUsername(data.creator_username)}</Text>
              </Text>

              <View style={styles.amountCard}>
                <Text style={styles.amountLabel}>You will receive</Text>
                <Text style={styles.amountValue}>{formatCurrency(data.amount_per_claim)}</Text>
              </View>

              {data.requires_password ? (
                <View style={styles.passwordCard}>
                  <Text style={styles.passwordLabel}>Drop Password</Text>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter drop password"
                    placeholderTextColor="#6D7178"
                    value={lockPassword}
                    onChangeText={setLockPassword}
                    secureTextEntry
                  />
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.claimButton, isPending && styles.claimButtonDisabled]}
                onPress={onClaim}
                disabled={isPending}
              >
                <Text style={styles.claimButtonText}>
                  {isPending ? 'Claiming...' : 'Claim Now'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    marginBottom: 18,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    color: '#F5F6F8',
    fontSize: 26,
    fontWeight: '700',
    marginTop: 10,
  },
  statusText: {
    color: '#90949B',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  headerTitle: {
    color: '#F4F5F7',
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
  },
  headerSubtitle: {
    color: '#8A8E95',
    fontSize: 17,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  creatorName: {
    color: BRAND_YELLOW,
    fontWeight: '700',
  },
  amountCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    color: '#7B7F87',
    fontSize: 16,
    marginBottom: 6,
  },
  amountValue: {
    color: '#F5F6F8',
    fontSize: 46,
    fontWeight: '700',
  },
  passwordCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  passwordLabel: {
    color: '#E7E9EC',
    fontSize: 16,
    marginBottom: 10,
  },
  passwordInput: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#F1F2F4',
    fontSize: 18,
    paddingHorizontal: 12,
  },
  claimButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  claimButtonDisabled: {
    opacity: 0.75,
  },
  claimButtonText: {
    color: '#0A0B0D',
    fontSize: 19,
    fontWeight: '700',
  },
});

export default ClaimDropScreen;
