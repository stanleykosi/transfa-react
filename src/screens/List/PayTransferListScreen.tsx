import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';

import type { AppStackParamList } from '@/navigation/AppStack';
import SendUnifiedScreen from '@/screens/PaymentFlow/SendUnifiedScreen';

type PayTransferListRoute = RouteProp<AppStackParamList, 'PayTransferList'>;

const PayTransferListScreen = () => {
  const route = useRoute<PayTransferListRoute>();
  const { listId } = route.params;

  return <SendUnifiedScreen initialMode="transfer" listId={listId} />;
};

export default PayTransferListScreen;
