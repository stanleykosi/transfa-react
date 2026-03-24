import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';

import type { AppStackParamList } from '@/navigation/AppStack';
import SendUnifiedScreen from './SendUnifiedScreen';

type PayUserRoute = RouteProp<AppStackParamList, 'PayUser'>;

const PayUserScreen = () => {
  const route = useRoute<PayUserRoute>();

  return (
    <SendUnifiedScreen
      initialMode="transfer"
      initialRecipient={route.params?.initialRecipient ?? null}
    />
  );
};

export default PayUserScreen;
