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

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppTabs, { AppTabsParamList } from './AppTabs';
import OnboardingFormScreen from '@/screens/Onboarding/OnboardingFormScreen';
import { NavigatorScreenParams } from '@react-navigation/native';

// Define the parameter list for the AppStack routes for type safety.
// It includes the AppTabs (as a nested navigator) and the OnboardingForm.
export type AppStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabsParamList>; // Nested navigator
  OnboardingForm: undefined;
  CreateAccount: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

const AppStack = () => {
  // TODO: In a later step, add logic here to check if the user needs onboarding.
  // This would involve an API call to a `/users/me` endpoint.
  // const { data: user, isLoading } = useQuery(['currentUser']);
  // const needsOnboarding = user && !user.onboardingCompleted;
  // Based on `needsOnboarding`, the initialRouteName could be conditionally set,
  // or a `useEffect` could trigger a navigation.replace action.
  const initialRouteName = 'OnboardingForm'; // For testing the onboarding flow

  return (
    <Stack.Navigator initialRouteName={initialRouteName}>
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
