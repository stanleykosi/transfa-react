import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchOnboardingStatus } from '@/api/authApi';
import { AppStackParamList } from '@/navigation/AppStack';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreateAccount'>;

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

const PaperPlane = () => {
  return (
    <View style={styles.planeWrap}>
      <View style={styles.planeMain} />
      <View style={styles.planeWing} />
      <View style={styles.planeTail} />
      <View style={[styles.trail, styles.trailOne]} />
      <View style={[styles.trail, styles.trailTwo]} />
      <View style={[styles.trail, styles.trailThree]} />
    </View>
  );
};

const OnboardingProcessingScreen = () => {
  const navigation = useNavigation<Navigation>();
  const [pollCount, setPollCount] = useState(0);
  const hasNavigatedRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    let isActive = true;

    const goToResult = (
      outcome: 'success' | 'failure' | 'manual_review',
      status: string,
      reason?: string
    ) => {
      if (!isActive || hasNavigatedRef.current) {
        return;
      }
      hasNavigatedRef.current = true;
      navigation.dispatch(StackActions.replace('OnboardingResult', { outcome, status, reason }));
    };

    const tick = async () => {
      if (!isActive || hasNavigatedRef.current) {
        return;
      }

      try {
        const statusResponse = await fetchOnboardingStatus();
        const normalizedStatus = statusResponse.status?.toLowerCase?.() ?? '';
        const reason = statusResponse.reason;

        if (normalizedStatus === 'completed') {
          goToResult('success', normalizedStatus, reason);
          return;
        }

        if (normalizedStatus === 'tier2_manual_review') {
          goToResult('manual_review', normalizedStatus, reason);
          return;
        }

        if (
          normalizedStatus === 'tier2_rejected' ||
          normalizedStatus === 'tier2_error' ||
          normalizedStatus === 'tier2_failed' ||
          normalizedStatus === 'tier2_reenter_information' ||
          normalizedStatus === 'tier2_awaiting_document' ||
          normalizedStatus === 'tier1_failed' ||
          normalizedStatus === 'tier1_system_error' ||
          normalizedStatus === 'tier1_rate_limited'
        ) {
          goToResult('failure', normalizedStatus, reason);
          return;
        }
      } catch (error) {
        if (pollCountRef.current >= 4) {
          goToResult(
            'failure',
            'status_check_error',
            'Unable to confirm onboarding status right now.'
          );
        }
      } finally {
        if (isActive) {
          pollCountRef.current += 1;
          setPollCount(pollCountRef.current);
        }
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [navigation]);

  useEffect(() => {
    if (pollCount < MAX_POLLS || hasNavigatedRef.current) {
      return;
    }
    hasNavigatedRef.current = true;
    navigation.dispatch(
      StackActions.replace('OnboardingResult', {
        outcome: 'manual_review',
        status: 'tier2_manual_review',
        reason: 'Verification is taking longer than expected. Please check back shortly.',
      })
    );
  }, [navigation, pollCount]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <View style={styles.content}>
          <PaperPlane />
          <Text style={styles.title}>Processing...</Text>
          <Text style={styles.subtitle}>Fill your information below</Text>

          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={() =>
              navigation.dispatch(
                StackActions.replace('OnboardingForm', {
                  userType: 'personal',
                  startStep: 1,
                  forceTier1Update: true,
                })
              )
            }
          >
            <Text style={styles.editButtonText}>Go Back To Tier 1</Text>
          </TouchableOpacity>
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  planeWrap: {
    width: 130,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  planeMain: {
    width: 0,
    height: 0,
    borderLeftWidth: 55,
    borderRightWidth: 55,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#F7DB5F',
    transform: [{ rotate: '15deg' }],
  },
  planeWing: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopWidth: 12,
    borderLeftWidth: 45,
    borderTopColor: 'transparent',
    borderLeftColor: '#C3790E',
    transform: [{ rotate: '14deg' }],
    top: 44,
    left: 40,
  },
  planeTail: {
    position: 'absolute',
    width: 5,
    height: 42,
    borderRadius: 4,
    backgroundColor: '#A76811',
    top: 45,
  },
  trail: {
    position: 'absolute',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8B011',
  },
  trailOne: {
    left: 4,
    top: 72,
    transform: [{ rotate: '-30deg' }],
  },
  trailTwo: {
    left: 6,
    top: 94,
    transform: [{ rotate: '-34deg' }],
  },
  trailThree: {
    left: 48,
    top: 98,
    transform: [{ rotate: '-34deg' }],
    backgroundColor: '#AA680B',
  },
  title: {
    color: '#F2F2F2',
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    color: '#4E5157',
    fontSize: 17,
    fontWeight: '500',
  },
  editButton: {
    marginTop: 28,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 211, 0, 0.55)',
    backgroundColor: 'rgba(255, 211, 0, 0.06)',
  },
  editButtonText: {
    color: '#FFD300',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default OnboardingProcessingScreen;
