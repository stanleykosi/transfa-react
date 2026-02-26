/**
 * @description
 * This file defines the navigation stack for the Profile section of the app.
 * It manages the navigation between the main profile screen and related settings flows.
 *
 * Key features:
 * - Manages the user profile and settings-related screens.
 * - Allows for a standard stack navigation experience (pushing/popping screens).
 *
 * @dependencies
 * - @react-navigation/native-stack: For creating the stack navigator.
 * - Screens: Imports the ProfileScreen and account/settings sub-screens.
 *
 * @notes
 * - This stack is nested within the `AppTabs` navigator, replacing the direct link
 *   to `ProfileScreen` to allow for deeper navigation within the profile tab.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '@/screens/Profile/ProfileScreen';
import BeneficiariesScreen from '@/screens/Settings/BeneficiariesScreen';
import AddBeneficiaryScreen from '@/screens/Settings/AddBeneficiaryScreen';
import ReceivingPreferencesScreen from '@/screens/Settings/ReceivingPreferencesScreen';
import KycLevelScreen from '@/screens/Settings/KycLevelScreen';
import KycTier3UpgradeScreen from '@/screens/Settings/KycTier3UpgradeScreen';
import LinkAccountPinScreen from '@/screens/Settings/LinkAccountPinScreen';
import PinSettingsScreen from '@/screens/Settings/PinSettingsScreen';
import PinOtpScreen from '@/screens/Settings/PinOtpScreen';
import PinCurrentScreen from '@/screens/Settings/PinCurrentScreen';
import PinNewScreen from '@/screens/Settings/PinNewScreen';
import PinVerifyScreen from '@/screens/Settings/PinVerifyScreen';
import PinChangeSuccessScreen from '@/screens/Settings/PinChangeSuccessScreen';

// Type definition for the routes and their parameters within this stack.
export type ProfileStackParamList = {
  ProfileHome: undefined;
  KycLevel: undefined;
  KycTier3Upgrade: undefined;
  Beneficiaries: undefined;
  LinkAccountPin: undefined;
  AddBeneficiary: undefined;
  ReceivingPreferences: undefined;
  PinSettings: undefined;
  PinOtp: undefined;
  PinCurrent: undefined;
  PinNew: undefined;
  PinVerify: undefined;
  PinChangeSuccess: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

const ProfileStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="ProfileHome"
      screenOptions={{
        headerShown: false, // Headers will be managed by individual screens
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="KycLevel" component={KycLevelScreen} />
      <Stack.Screen name="KycTier3Upgrade" component={KycTier3UpgradeScreen} />
      <Stack.Screen name="Beneficiaries" component={BeneficiariesScreen} />
      <Stack.Screen name="LinkAccountPin" component={LinkAccountPinScreen} />
      <Stack.Screen name="AddBeneficiary" component={AddBeneficiaryScreen} />
      <Stack.Screen name="ReceivingPreferences" component={ReceivingPreferencesScreen} />
      <Stack.Screen name="PinSettings" component={PinSettingsScreen} />
      <Stack.Screen name="PinOtp" component={PinOtpScreen} />
      <Stack.Screen name="PinCurrent" component={PinCurrentScreen} />
      <Stack.Screen name="PinNew" component={PinNewScreen} />
      <Stack.Screen name="PinVerify" component={PinVerifyScreen} />
      <Stack.Screen name="PinChangeSuccess" component={PinChangeSuccessScreen} />
    </Stack.Navigator>
  );
};

export default ProfileStack;
