import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { completePinChange } from '@/api/authApi';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import PinStepTemplate from './components/PinStepTemplate';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinVerify'>;

const PinVerifyScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const currentPin = useSensitiveFlowStore((state) => state.pinChangeCurrentPin);
  const newPin = useSensitiveFlowStore((state) => state.pinChangeNewPin);
  const clearPinChangeFlow = useSensitiveFlowStore((state) => state.clearPinChangeFlow);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentPin || !newPin) {
      setErrorMessage('PIN change session expired. Start again.');
      navigation.replace('PinCurrent');
    }
  }, [currentPin, navigation, newPin]);

  const completeMutation = useMutation({
    mutationFn: completePinChange,
    onSuccess: () => {
      clearPinChangeFlow();
      navigation.replace('PinChangeSuccess');
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail || error?.message || 'Unable to complete PIN change.';
      setErrorMessage(detail);
    },
  });

  const onSubmit = (confirmPin: string) => {
    setErrorMessage(null);
    if (!currentPin || !newPin) {
      setErrorMessage('PIN change session expired. Start again.');
      navigation.replace('PinCurrent');
      return;
    }
    if (confirmPin !== newPin) {
      setErrorMessage('PINs do not match. Re-enter your new PIN.');
      return;
    }

    completeMutation.mutate({
      current_pin: currentPin,
      new_pin: newPin,
    });
  };

  return (
    <PinStepTemplate
      title="Verify New PIN"
      subtitle="Verify New pin"
      buttonLabel="Verify"
      onSubmit={onSubmit}
      loading={completeMutation.isPending}
      errorMessage={errorMessage}
    />
  );
};

export default PinVerifyScreen;
