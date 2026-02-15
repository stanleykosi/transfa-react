import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';

type ResultRoute = RouteProp<AppStackParamList, 'OnboardingResult'>;
type Navigation = NativeStackNavigationProp<AppStackParamList, 'OnboardingResult'>;

const normalizeReason = (value?: string) => value?.trim() || '';

const resolveRecovery = (status: string, reason: string) => {
  const normalized = `${status} ${reason}`.toLowerCase();

  if (
    (normalized.includes('name') || normalized.includes('phone')) &&
    (normalized.includes('match') || normalized.includes('mismatch'))
  ) {
    return { label: 'Update Tier 1 Details', startStep: 1 as const, forceTier1Update: true };
  }

  if (normalized.includes('reenter_information')) {
    return { label: 'Update Tier 1 Details', startStep: 1 as const, forceTier1Update: true };
  }

  if (
    normalized.includes('bvn') &&
    (normalized.includes('invalid') ||
      normalized.includes('not valid') ||
      normalized.includes('does not exist') ||
      normalized.includes('incorrect') ||
      normalized.includes('mismatch'))
  ) {
    return { label: 'Fix BVN Details', startStep: 3 as const, forceTier1Update: false };
  }

  return { label: 'Fix And Retry', startStep: 1 as const, forceTier1Update: true };
};

const SuccessBadge = () => {
  return (
    <View style={styles.badgeWrap}>
      <View style={styles.badge} />
      <Ionicons name="checkmark" size={42} color="#090A0B" style={styles.badgeCheck} />
      <View style={[styles.confettiDot, styles.dotA]} />
      <View style={[styles.confettiDot, styles.dotB]} />
      <View style={[styles.confettiDot, styles.dotC]} />
      <View style={[styles.confettiDot, styles.dotD]} />
      <View style={[styles.confettiDot, styles.dotE]} />
      <View style={[styles.confettiDot, styles.dotF]} />
    </View>
  );
};

const OnboardingResultScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<ResultRoute>();

  const { outcome, status, reason } = route.params;
  const failureReason = normalizeReason(reason);
  const recovery = resolveRecovery(status, failureReason);

  const title =
    outcome === 'success'
      ? 'Success!'
      : outcome === 'manual_review'
        ? 'Review In Progress'
        : 'Verification Failed';
  const subtitle =
    outcome === 'success'
      ? 'Profile created successfully.'
      : outcome === 'manual_review'
        ? failureReason || 'Your verification is under manual review. We will update you shortly.'
        : failureReason ||
          'We could not complete your verification. Please fix your details and retry.';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <View style={styles.content}>
          <SuccessBadge />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {outcome === 'success' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={() => navigation.dispatch(StackActions.replace('CreateUsername'))}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.dispatch(
                    StackActions.replace('OnboardingForm', {
                      userType: 'personal',
                      startStep: recovery.startStep,
                      forceTier1Update: recovery.forceTier1Update,
                    })
                  )
                }
              >
                <Text style={styles.primaryButtonText}>{recovery.label}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.85}
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
                <Text style={styles.secondaryButtonText}>Back To Tier 1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textButton}
                activeOpacity={0.8}
                onPress={() => navigation.dispatch(StackActions.replace('CreateAccount'))}
              >
                <Text style={styles.textButtonText}>Check Status Again</Text>
              </TouchableOpacity>
            </>
          )}
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
  badgeWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#EDC24B',
    transform: [{ rotate: '45deg' }],
  },
  badgeCheck: {
    position: 'absolute',
  },
  confettiDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0C12B',
  },
  dotA: { top: 25, left: 34 },
  dotB: { top: 35, right: 30 },
  dotC: { left: 18, top: 82 },
  dotD: { right: 16, top: 88 },
  dotE: { left: 32, bottom: 36 },
  dotF: { right: 34, bottom: 28 },
  title: {
    color: '#F2F2F2',
    fontSize: 46,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#5A5B5F',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
  primaryButton: {
    marginTop: 30,
    width: '100%',
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD300',
  },
  primaryButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    width: '100%',
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  secondaryButtonText: {
    color: '#ECECEC',
    fontSize: 16,
    fontWeight: '600',
  },
  textButton: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  textButtonText: {
    color: '#C8A600',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default OnboardingResultScreen;
