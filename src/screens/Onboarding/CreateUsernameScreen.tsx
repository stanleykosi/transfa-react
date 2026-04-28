import React, { useState } from 'react';
import { Alert } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AppStackParamList } from '@/types/navigation';
import { submitUsernameSetup } from '@/api/authApi';
import { USERNAME_REGEX, normalizeUsername } from '@/utils/username';
import AuthCreateUsername from '@/components/source-auth/auth-create-username';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreateUsername'>;

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('status' in response)) {
    return undefined;
  }
  return typeof response.status === 'number' ? response.status : undefined;
};

const getUsernameSetupErrorMessage = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return 'Please try again in a moment.';
  }
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    return 'Please try again in a moment.';
  }
  const data = response.data;
  if (typeof data === 'object' && data !== null) {
    if ('detail' in data && typeof data.detail === 'string') {
      return data.detail;
    }
    if ('error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return 'Please try again in a moment.';
};

const CreateUsernameScreen = () => {
  const navigation = useNavigation<Navigation>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (submittedUsername: string) => {
    if (isSubmitting) {
      return;
    }

    const normalized = normalizeUsername(submittedUsername)
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '');

    if (!USERNAME_REGEX.test(normalized)) {
      Alert.alert('Invalid username', 'Use 3-20 lowercase letters, numbers, dot or underscore.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitUsernameSetup({ username: normalized });
      navigation.navigate('CreatePin');
    } catch (error: unknown) {
      const status = getHttpStatus(error);
      if (status === 409) {
        Alert.alert('Username unavailable', 'Try another username.');
      } else if (status === 412) {
        Alert.alert(
          'Account setup in progress',
          'Please wait while we finish provisioning your account.'
        );
      } else {
        Alert.alert('Unable to save username', getUsernameSetupErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCreateUsername
      onNext={onSubmit}
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.dispatch(StackActions.replace('CreateAccount'));
      }}
      isSubmitting={isSubmitting}
    />
  );
};

export default CreateUsernameScreen;
