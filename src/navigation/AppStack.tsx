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
import AppTabs, { AppTabsParamList } from './AppTabs';
import OnboardingFormScreen from '@/screens/Onboarding/OnboardingFormScreen';
import { NavigatorScreenParams } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import apiClient from '@/api/apiClient';
import { View, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';

// Define the parameter list for the AppStack routes for type safety.
// It includes the AppTabs (as a nested navigator) and the OnboardingForm.
export type AppStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabsParamList>; // Nested navigator
  OnboardingForm: undefined;
  CreateAccount: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

const AppStack = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [initialRoute, setInitialRoute] = useState<'AppTabs' | 'OnboardingForm' | 'CreateAccount'>(
    'AppTabs'
  );

  useEffect(() => {
    const checkUserStatus = async () => {
      if (!user?.id) {
        return;
      }

      try {
        const token = await getToken().catch(() => undefined);
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: {
            'X-Clerk-User-Id': user.id,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        switch (data?.status) {
          case 'completed':
          case 'tier1_created':
            setInitialRoute('AppTabs');
            break;
          case 'tier0_created':
            setInitialRoute('CreateAccount');
            break;
          case 'tier0_pending':
            // Keep user in onboarding; the screen will show a slim in-place loader and poll
            setInitialRoute('OnboardingForm');
            break;
          case 'new':
          default:
            setInitialRoute('OnboardingForm');
            break;
        }
      } catch (error: any) {
        // Swallow 404s (new user) and quietly route to onboarding
        const status = error?.response?.status;
        if (status !== 404) {
          console.warn('Status check failed:', status);
        }
        // Default to onboarding form if we can't check status
        setInitialRoute('OnboardingForm');
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkUserStatus();
  }, [user?.id, getToken]);

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
        component={require('@/screens/Onboarding/CreateAccountScreen').default}
        options={{
          title: 'Create Account',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
};

export default AppStack;
