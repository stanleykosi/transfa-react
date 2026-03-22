import { RouteProp, useRoute } from '@react-navigation/native';
import React from 'react';

import type { AppStackParamList } from '@/navigation/AppStack';

import ReceiveUnifiedScreen from './ReceiveUnifiedScreen';

type CreateRequestRoute = RouteProp<AppStackParamList, 'CreatePaymentRequest'>;

const CreateRequestScreen = () => {
  const route = useRoute<CreateRequestRoute>();

  const initialRecipient = route.params?.initialRecipient ?? null;
  const forcedMode = route.params?.forceMode;

  return (
    <ReceiveUnifiedScreen
      initialTab="request"
      initialShowRequestForm
      initialRequestType={forcedMode ?? (initialRecipient ? 'individual' : 'general')}
      initialRecipient={initialRecipient}
      closeFormOnBack={false}
    />
  );
};

export default CreateRequestScreen;
