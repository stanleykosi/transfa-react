/**
 * @description
 * This file defines the navigation stack for the Profile section of the app.
 * It manages the navigation between the main profile screen and its related sub-screens,
 * such as the security settings page.
 *
 * Key features:
 * - Manages the user profile and settings-related screens.
 * - Allows for a standard stack navigation experience (pushing/popping screens).
 *
 * @dependencies
 * - @react-navigation/native-stack: For creating the stack navigator.
 * - Screens: Imports the ProfileScreen and SecuritySettingsScreen components.
 *
 * @notes
 * - This stack is nested within the `AppTabs` navigator, replacing the direct link
 *   to `ProfileScreen` to allow for deeper navigation within the profile tab.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '@/screens/Profile/ProfileScreen';
import SecuritySettingsScreen from '@/screens/Settings/SecuritySettingsScreen';
import BeneficiariesScreen from '@/screens/Settings/BeneficiariesScreen';
import AddBeneficiaryScreen from '@/screens/Settings/AddBeneficiaryScreen';

// Type definition for the routes and their parameters within this stack.
export type ProfileStackParamList = {
  ProfileHome: undefined;
  SecuritySettings: undefined;
  Beneficiaries: undefined;
  AddBeneficiary: undefined;
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
      <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
      <Stack.Screen name="Beneficiaries" component={BeneficiariesScreen} />
      <Stack.Screen name="AddBeneficiary" component={AddBeneficiaryScreen} />
    </Stack.Navigator>
  );
};

export default ProfileStack;
