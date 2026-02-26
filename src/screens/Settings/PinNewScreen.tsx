import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import PinStepTemplate from './components/PinStepTemplate';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinNew'>;

const PinNewScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const currentPin = useSensitiveFlowStore((state) => state.pinChangeCurrentPin);
  const setPinChangeNewPin = useSensitiveFlowStore((state) => state.setPinChangeNewPin);

  useEffect(() => {
    if (!currentPin) {
      Alert.alert('Session expired', 'Re-verify your current PIN to continue.');
      navigation.replace('PinCurrent');
    }
  }, [currentPin, navigation]);

  const onSubmit = (pin: string) => {
    if (!currentPin) {
      Alert.alert('Session expired', 'Re-verify your current PIN to continue.');
      navigation.replace('PinCurrent');
      return;
    }
    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Enter a valid 4-digit PIN.');
      return;
    }
    if (pin === currentPin) {
      Alert.alert('Invalid PIN', 'New PIN must be different from current PIN.');
      return;
    }
    setPinChangeNewPin(pin);
    navigation.replace('PinVerify');
  };

  return (
    <PinStepTemplate
      title="Enter New PIN"
      subtitle="Enter New pin"
      buttonLabel="Next"
      onSubmit={onSubmit}
    />
  );
};

export default PinNewScreen;
