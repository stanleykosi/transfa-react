/**
 * @description
 * This file defines the navigation stack for the authentication flow. It includes
 * screens that are accessible to unauthenticated users, such as Sign In and Sign Up.
 *
 * @dependencies
 * - @react-navigation/native-stack: For creating a stack-based navigator.
 * - Screens: Imports the SignInScreen and SignUpScreen components.
 *
 * @notes
 * - The `headerShown: false` option is used to provide a custom, chromeless
 *   UI for the authentication experience, allowing full control over the screen layout.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from '@/screens/Auth/SignInScreen';
import SignUpScreen from '@/screens/Auth/SignUpScreen';
import VerifyCodeScreen from '@/screens/Auth/VerifyCodeScreen';
import ForgotPasswordScreen from '@/screens/Auth/ForgotPasswordScreen';

// Define the parameter list for the AuthStack routes for type safety.
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  VerifyCode: {
    emailAddressId?: string;
  };
  ForgotPassword: {
    identifier?: string;
  };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="SignIn"
      screenOptions={{
        headerShown: false, // Hides the default header for a custom UI
      }}
    >
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

export default AuthStack;
