import React, { useEffect, useRef, useState } from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchOnboardingStatus } from '@/api/authApi';
import type { AppStackParamList } from '@/types/navigation';
import AuthProcessing from '@/components/source-auth/auth-processing';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreateAccount'>;

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

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

    const goToRoute = (
      route: keyof AppStackParamList,
      params?: AppStackParamList[keyof AppStackParamList]
    ) => {
      if (!isActive || hasNavigatedRef.current) {
        return;
      }
      hasNavigatedRef.current = true;
      navigation.dispatch(StackActions.replace(route as never, params as never));
    };

    const tick = async () => {
      if (!isActive || hasNavigatedRef.current) {
        return;
      }

      try {
        const statusResponse = await fetchOnboardingStatus();
        const normalizedStatus = statusResponse.status?.toLowerCase?.() ?? '';
        const reason = statusResponse.reason;
        const resumeStep = statusResponse.resume_step || 3;

        if (statusResponse.next_step === 'app_tabs') {
          goToRoute('AppTabs');
          return;
        }

        if (statusResponse.next_step === 'create_username') {
          goToRoute('CreateUsername');
          return;
        }

        if (statusResponse.next_step === 'create_pin') {
          goToRoute('CreatePin');
          return;
        }

        if (
          statusResponse.next_step === 'onboarding_form' ||
          normalizedStatus === 'tier1_created'
        ) {
          goToRoute('OnboardingForm', {
            userType: statusResponse.user_type || 'personal',
            startStep: resumeStep,
            forceTier1Update: resumeStep === 1,
          });
          return;
        }

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
      } catch {
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

  return <AuthProcessing onComplete={() => undefined} />;
};

export default OnboardingProcessingScreen;
