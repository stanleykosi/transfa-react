/**
 * @description
 * This file defines the primary navigation stack for authenticated users.
 * It uses a Native Stack Navigator to manage screens that are accessible
 * after a user has successfully logged in. This stack serves as a container
 * for the main tab navigator and other full-screen flows like user onboarding.
 *
 * @dependencies
 * - @react-navigation/native-stack: For creating the stack navigator.
 * - AppTabs: The bottom tab navigator component for the app's main sections.
 * - OnboardingFormScreen: The screen for new users to complete their profile.
 *
 * @notes
 * - The main `AppTabs` screen has its header hidden to provide a seamless
 *   transition from the stack to the tabbed interface.
 * - This structure allows us to push screens like `OnboardingForm` over the
 *   entire tab bar, which is ideal for modal or sequential flows post-authentication.
 */

import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigatorScreenParams } from '@react-navigation/native';
import { View, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import type { UserDiscoveryResult } from '@/types/api';

import AppTabs, { AppTabsParamList } from './AppTabs';
import OnboardingFormScreen from '@/screens/Onboarding/OnboardingFormScreen';
import SelectAccountTypeScreen from '@/screens/Onboarding/SelectAccountTypeScreen';
import OnboardingProcessingScreen from '@/screens/Onboarding/OnboardingProcessingScreen';
import OnboardingResultScreen from '@/screens/Onboarding/OnboardingResultScreen';
import CreateUsernameScreen from '@/screens/Onboarding/CreateUsernameScreen';
import CreatePinScreen from '@/screens/Onboarding/CreatePinScreen';
import ConfirmPinScreen from '@/screens/Onboarding/ConfirmPinScreen';
import UserSearchScreen from '@/screens/Home/UserSearchScreen';
import PayUserScreen from '@/screens/PaymentFlow/PayUserScreen';
import SelfTransferScreen from '@/screens/PaymentFlow/SelfTransferScreen';
import TransferStatusScreen from '@/screens/PaymentFlow/TransferStatusScreen';
import MultiReceiptScreen from '@/screens/PaymentFlow/MultiReceiptScreen';
import CreateRequestScreen from '@/screens/PaymentRequests/CreateRequestScreen';
import PaymentRequestSuccessScreen from '@/screens/PaymentRequests/PaymentRequestSuccessScreen';
import PaymentRequestsListScreen from '@/screens/PaymentRequests/PaymentRequestsListScreen';
import PaymentRequestHistoryScreen from '@/screens/PaymentRequests/PaymentRequestHistoryScreen';
import CreateDropWizardScreen from '@/screens/MoneyDrop/CreateDropWizardScreen';
import MoneyDropSuccessScreen from '@/screens/MoneyDrop/MoneyDropSuccessScreen';
import ClaimDropScreen from '@/screens/MoneyDrop/ClaimDropScreen';
import { fetchAuthSession } from '@/api/authApi';
import { theme } from '@/constants/theme';

// Define the parameter list for the AppStack routes for type safety.
// It includes the AppTabs (as a nested navigator) and the OnboardingForm.
export type AppStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabsParamList>; // Nested navigator
  SelectAccountType: undefined;
  OnboardingForm: {
    userType?: 'personal' | 'merchant';
    startStep?: 1 | 2 | 3;
    forceTier1Update?: boolean;
  };
  CreateAccount: undefined;
  CreateUsername: undefined;
  CreatePin: undefined;
  ConfirmPin: { pin: string };
  OnboardingResult: {
    outcome: 'success' | 'failure' | 'manual_review';
    status: string;
    reason?: string;
  };
  UserSearch: undefined;
  PayUser:
    | {
        initialRecipient?: UserDiscoveryResult;
      }
    | undefined;
  SelfTransfer: undefined;
  TransferStatus: {
    transactionId: string;
    amount: number;
    fee: number;
    description?: string;
    recipientUsername?: string;
    transferType?: string;
    initialStatus?: 'pending' | 'failed';
    failureReason?: string;
  };
  MultiTransferReceipts: {
    receipts: Array<{
      transactionId: string;
      amount: number;
      fee: number;
      description: string;
      recipientUsername: string;
    }>;
    failures?: Array<{
      recipient_username: string;
      amount: number;
      description: string;
      error: string;
    }>;
  };
  PaymentRequestsList: undefined; // New screen for viewing payment request history
  PaymentRequestHistory: undefined;
  CreatePaymentRequest: undefined;
  PaymentRequestSuccess: { requestId: string };
  // Money Drop Screens
  CreateDropWizard: undefined;
  MoneyDropSuccess: { dropDetails: import('@/types/api').MoneyDropResponse };
  ClaimDrop: { dropId: string };
};

const Stack = createNativeStackNavigator<AppStackParamList>();

const AppStack = () => {
  const { user } = useUser();
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [initialRoute, setInitialRoute] = useState<
    | 'AppTabs'
    | 'SelectAccountType'
    | 'OnboardingForm'
    | 'CreateAccount'
    | 'CreateUsername'
    | 'CreatePin'
  >('AppTabs');

  useEffect(() => {
    const checkUserStatus = async () => {
      if (!user?.id) {
        return;
      }

      try {
        const session = await fetchAuthSession();
        switch (session?.onboarding?.next_step) {
          case 'app_tabs':
            setInitialRoute('AppTabs');
            break;
          case 'create_account':
            setInitialRoute('CreateAccount');
            break;
          case 'create_username':
            setInitialRoute('CreateUsername');
            break;
          case 'create_pin':
            setInitialRoute('CreatePin');
            break;
          case 'onboarding_form':
            if (session?.onboarding?.status === 'new' && !session?.onboarding?.resume_step) {
              setInitialRoute('SelectAccountType');
              break;
            }
            setInitialRoute('OnboardingForm');
            break;
          default:
            setInitialRoute('OnboardingForm');
            break;
        }
      } catch (error: any) {
        // 404 indicates no onboarding user record yet for this Clerk identity.
        const status = error?.response?.status;
        if (status === 404) {
          setInitialRoute('SelectAccountType');
        } else {
          console.warn('Status check failed:', status);
          // Default to onboarding form if we can't check status
          setInitialRoute('OnboardingForm');
        }
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkUserStatus();
  }, [user?.id]);

  // Show loading while checking status
  if (isCheckingStatus) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute}>
      <Stack.Screen
        name="AppTabs"
        component={AppTabs}
        options={{ headerShown: false }} // The tab navigator will manage its own headers.
      />
      <Stack.Screen
        name="SelectAccountType"
        component={SelectAccountTypeScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="OnboardingForm"
        component={OnboardingFormScreen}
        options={{
          title: 'Complete Your Profile',
          headerBackVisible: false, // Prevent going back from onboarding
          gestureEnabled: false, // Disable swipe gesture
        }}
      />
      <Stack.Screen
        name="CreateAccount"
        component={OnboardingProcessingScreen}
        options={{
          headerShown: false,
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="CreateUsername"
        component={CreateUsernameScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="CreatePin"
        component={CreatePinScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="ConfirmPin"
        component={ConfirmPinScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="OnboardingResult"
        component={OnboardingResultScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="UserSearch"
        component={UserSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="PayUser" component={PayUserScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="SelfTransfer"
        component={SelfTransferScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferStatus"
        component={TransferStatusScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MultiTransferReceipts"
        component={MultiReceiptScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentRequestsList"
        component={PaymentRequestsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentRequestHistory"
        component={PaymentRequestHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreatePaymentRequest"
        component={CreateRequestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentRequestSuccess"
        component={PaymentRequestSuccessScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      {/* Money Drop Screens */}
      <Stack.Screen
        name="CreateDropWizard"
        component={CreateDropWizardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MoneyDropSuccess"
        component={MoneyDropSuccessScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="ClaimDrop" component={ClaimDropScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

export default AppStack;
