import React from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import PinStepTemplate from './components/PinStepTemplate';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinCurrent'>;

const PinCurrentScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const setPinChangeCurrentPin = useSensitiveFlowStore((state) => state.setPinChangeCurrentPin);
  const setPinChangeNewPin = useSensitiveFlowStore((state) => state.setPinChangeNewPin);

  const onSubmit = (pin: string) => {
    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Enter your current 4-digit PIN.');
      return;
    }
    setPinChangeCurrentPin(pin);
    setPinChangeNewPin('');
    navigation.replace('PinNew');
  };

  return (
    <PinStepTemplate
      title="Enter Current PIN"
      subtitle="Enter current pin"
      buttonLabel="Next"
      onSubmit={onSubmit}
    />
  );
};

export default PinCurrentScreen;
