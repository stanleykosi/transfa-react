import React, { useState } from 'react';
import { Alert } from 'react-native';
import { RouteProp, StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';
import { submitTransactionPinSetup } from '@/api/authApi';
import { useSecurityStore } from '@/store/useSecurityStore';
import AuthConfirmPin from '@/components/source-auth/auth-confirm-pin';

type RouteType = RouteProp<AppStackParamList, 'ConfirmPin'>;
type Navigation = NativeStackNavigationProp<AppStackParamList, 'ConfirmPin'>;

const ConfirmPinScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteType>();
  const { setPin: setLocalPin } = useSecurityStore();

  const initialPin = route.params?.pin || '';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onConfirm = async (pin: string) => {
    if (isSubmitting) {
      return;
    }

    if (pin !== initialPin) {
      Alert.alert('Pin mismatch', 'The confirmation pin does not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitTransactionPinSetup({ pin });
      try {
        await setLocalPin(pin);
      } catch (localError) {
        console.warn('Failed to persist local PIN cache after backend setup', localError);
      }
      navigation.dispatch(StackActions.replace('AppTabs'));
    } catch (error: any) {
      Alert.alert(
        'Unable to save PIN',
        error?.response?.data?.detail ||
          error?.response?.data?.error ||
          'Please try again in a moment.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthConfirmPin
      originalPin={initialPin}
      onConfirm={onConfirm}
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.dispatch(StackActions.replace('CreatePin'));
      }}
      isSubmitting={isSubmitting}
    />
  );
};

export default ConfirmPinScreen;
