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
import { View } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import type { AppStackParamList } from '@/types/navigation';

import AppTabs from './AppTabs';
import OnboardingFormScreen from '@/screens/Onboarding/OnboardingFormScreen';
import SelectAccountTypeScreen from '@/screens/Onboarding/SelectAccountTypeScreen';
import OnboardingProcessingScreen from '@/screens/Onboarding/OnboardingProcessingScreen';
import OnboardingResultScreen from '@/screens/Onboarding/OnboardingResultScreen';
import CreateUsernameScreen from '@/screens/Onboarding/CreateUsernameScreen';
import CreatePinScreen from '@/screens/Onboarding/CreatePinScreen';
import ConfirmPinScreen from '@/screens/Onboarding/ConfirmPinScreen';
import UserSearchScreen from '@/screens/Home/UserSearchScreen';
import UserProfileViewScreen from '@/screens/Home/UserProfileViewScreen';
import PayUserScreen from '@/screens/PaymentFlow/PayUserScreen';
import SelfTransferScreen from '@/screens/PaymentFlow/SelfTransferScreen';
import TransferStatusScreen from '@/screens/PaymentFlow/TransferStatusScreen';
import MultiReceiptScreen from '@/screens/PaymentFlow/MultiReceiptScreen';
import PaymentVerificationScreen from '@/screens/PaymentFlow/PaymentVerificationScreen';
import CreateRequestScreen from '@/screens/PaymentRequests/CreateRequestScreen';
import PaymentRequestSuccessScreen from '@/screens/PaymentRequests/PaymentRequestSuccessScreen';
import PaymentRequestsListScreen from '@/screens/PaymentRequests/PaymentRequestsListScreen';
import PaymentRequestHistoryScreen from '@/screens/PaymentRequests/PaymentRequestHistoryScreen';
import NotificationCenterScreen from '@/screens/Notifications/Notification';
import IncomingRequestsScreen from '@/screens/Notifications/IncomingRequest';
import IncomingRequestDetailScreen from '@/screens/Notifications/IncomingRequestDetail';
import RequestPaymentSummaryScreen from '@/screens/Notifications/RequestPaymentSummary';
import RequestPaymentAuthScreen from '@/screens/Notifications/RequestPaymentAuthScreen';
import ScanScreen from '@/screens/Scan/ScanScreen';
import CreateDropWizardScreen from '@/screens/MoneyDrop/CreateDropWizardScreen';
import MoneyDropSuccessScreen from '@/screens/MoneyDrop/MoneyDropSuccessScreen';
import ClaimDropScreen from '@/screens/MoneyDrop/ClaimDropScreen';
import MoneyDropDetailsScreen from '@/screens/MoneyDrop/MoneyDropDetailsScreen';
import MoneyDropClaimersScreen from '@/screens/MoneyDrop/MoneyDropClaimersScreen';
import MoneyDropClaimedHistoryScreen from '@/screens/MoneyDrop/MoneyDropClaimedHistoryScreen';
import TransferListsScreen from '@/screens/List/TransferListsScreen';
import CreateTransferListScreen from '@/screens/List/CreateTransferListScreen';
import TransferListDetailScreen from '@/screens/List/TransferListDetailScreen';
import PayTransferListScreen from '@/screens/List/PayTransferListScreen';
import { fetchAuthSession } from '@/api/authApi';

const Stack = createNativeStackNavigator<AppStackParamList>();

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = error.response;
  if (typeof response !== 'object' || response === null || !('status' in response)) {
    return undefined;
  }

  return typeof response.status === 'number' ? response.status : undefined;
};

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
      } catch (error: unknown) {
        // 404 indicates no onboarding user record yet for this Clerk identity.
        const status = getHttpStatus(error);
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
    return <View style={{ flex: 1, backgroundColor: '#FFD300' }} />;
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
      }}
    >
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
      <Stack.Screen name="Scan" component={ScanScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false, presentation: 'transparentModal' }}
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
      <Stack.Screen
        name="NotificationCenter"
        component={NotificationCenterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="IncomingRequests"
        component={IncomingRequestsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="IncomingRequestDetail"
        component={IncomingRequestDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RequestPaymentSummary"
        component={RequestPaymentSummaryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RequestPaymentAuth"
        component={RequestPaymentAuthScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentVerification"
        component={PaymentVerificationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferLists"
        component={TransferListsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferListCreate"
        component={CreateTransferListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferListDetail"
        component={TransferListDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PayTransferList"
        component={PayTransferListScreen}
        options={{ headerShown: false }}
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
      <Stack.Screen
        name="MoneyDropDetails"
        component={MoneyDropDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MoneyDropClaimers"
        component={MoneyDropClaimersScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MoneyDropClaimedHistory"
        component={MoneyDropClaimedHistoryScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default AppStack;
