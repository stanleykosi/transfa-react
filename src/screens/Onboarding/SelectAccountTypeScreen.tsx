import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchAccountTypeOptions } from '@/api/authApi';
import { useAuth } from '@/hooks/useAuth';
import { AccountTypeOption } from '@/types/api';
import type { AppStackParamList } from '@/types/navigation';
import { setNextAuthInitialRoute } from '@/navigation/authStackEntry';
import AuthAccountType from '@/components/source-auth/auth-account-type';

type AppNavigation = NativeStackNavigationProp<AppStackParamList, 'SelectAccountType'>;

const fallbackOptions: AccountTypeOption[] = [
  {
    type: 'personal',
    title: 'Individual',
    description: 'For Individual use',
  },
  {
    type: 'merchant',
    title: 'Merchant',
    description: 'For Business owners',
  },
];

const SelectAccountTypeScreen = () => {
  const navigation = useNavigation<AppNavigation>();
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [options, setOptions] = useState<AccountTypeOption[]>(fallbackOptions);

  useEffect(() => {
    let mounted = true;

    const loadOptions = async () => {
      try {
        const response = await fetchAccountTypeOptions();
        if (!mounted) {
          return;
        }

        if (Array.isArray(response.options) && response.options.length > 0) {
          setOptions(
            response.options.filter(
              (option): option is AccountTypeOption =>
                option?.type === 'personal' || option?.type === 'merchant'
            )
          );
        }
      } catch (error) {
        console.warn('Failed to load account type options. Using defaults.', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      mounted = false;
    };
  }, []);

  const hasPersonal = useMemo(() => options.some((item) => item.type === 'personal'), [options]);
  const hasMerchant = useMemo(() => options.some((item) => item.type === 'merchant'), [options]);

  if (isLoading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}
      >
        <ActivityIndicator size="small" color="#FFD300" />
      </View>
    );
  }

  return (
    <AuthAccountType
      onSelectIndividual={() => {
        if (!hasPersonal) {
          Alert.alert('Unavailable', 'Individual account type is not available right now.');
          return;
        }
        navigation.navigate('OnboardingForm', { userType: 'personal' });
      }}
      onSelectMerchant={() => {
        if (!hasMerchant) {
          Alert.alert('Unavailable', 'Merchant account type is not available right now.');
          return;
        }
        navigation.navigate('OnboardingForm', { userType: 'merchant' });
      }}
      onBack={async () => {
        try {
          setNextAuthInitialRoute('SignIn');
          await signOut();
        } catch (error) {
          setNextAuthInitialRoute(null);
          console.warn('Failed to sign out from SelectAccountType screen', error);
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }
      }}
    />
  );
};

export default SelectAccountTypeScreen;
