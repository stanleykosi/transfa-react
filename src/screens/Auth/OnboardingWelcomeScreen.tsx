import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import OnboardingScreen from '@/components/onboarding-screen';
import { AuthStackParamList } from '@/navigation/AuthStack';

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'OnboardingWelcome'>;

const OnboardingWelcomeScreen = () => {
  const navigation = useNavigation<AuthNavigation>();

  const handleComplete = useCallback(() => {
    navigation.replace('SignIn');
  }, [navigation]);

  return <OnboardingScreen onComplete={handleComplete} />;
};

export default OnboardingWelcomeScreen;
