import React from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppStackParamList } from '@/navigation/AppStack';
import AuthCreatePin from '@/components/source-auth/auth-create-pin';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'CreatePin'>;

const CreatePinScreen = () => {
  const navigation = useNavigation<Navigation>();

  return (
    <AuthCreatePin
      onNext={(pin) => navigation.navigate('ConfirmPin', { pin })}
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.dispatch(StackActions.replace('CreateUsername'));
      }}
    />
  );
};

export default CreatePinScreen;
