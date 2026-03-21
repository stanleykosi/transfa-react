import React, { useState } from 'react';
import { Alert } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';
import { submitUsernameSetup } from '@/api/authApi';
import { USERNAME_REGEX, normalizeUsername } from '@/utils/username';
import AuthCreateUsername from '@/components/source-auth/auth-create-username';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreateUsername'>;

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
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        Alert.alert('Username unavailable', 'Try another username.');
      } else if (status === 412) {
        Alert.alert(
          'Account setup in progress',
          'Please wait while we finish provisioning your account.'
        );
      } else {
        Alert.alert(
          'Unable to save username',
          error?.response?.data?.detail ||
            error?.response?.data?.error ||
            'Please try again in a moment.'
        );
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
