/**
 * @description
 * The main screen for the User Profile tab. This screen displays user information
 * and provides navigation to various settings and profile-related features.
 *
 * @dependencies
 * - react-native: For core UI components.
 * - @/components/ScreenWrapper: For consistent screen layout.
 * - @react-navigation/native: For the `useNavigation` hook.
 * - @expo/vector-icons: For icons in the settings list.
 *
 * @notes
 * - This screen is the root of the `ProfileStack`.
 */
import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';

type ProfileScreenNavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

// Move ItemSeparatorComponent outside of render to avoid unstable nested components warning
const ItemSeparator = () => <View style={styles.separator} />;

const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { signOut } = useAuth();

  const menuItems = [
    {
      title: 'Linked Accounts',
      icon: 'link-outline' as const,
      action: () => navigation.navigate('Beneficiaries'),
    },
    {
      title: 'Receiving Preferences',
      icon: 'wallet-outline' as const,
      action: () => navigation.navigate('ReceivingPreferences'),
    },
    {
      title: 'Subscription',
      icon: 'card-outline' as const,
      action: () => navigation.navigate('Subscription'),
    },
    {
      title: 'Security',
      icon: 'shield-checkmark-outline' as const,
      action: () => navigation.navigate('SecuritySettings'),
    },
    {
      title: 'Sign Out',
      icon: 'log-out-outline' as const,
      action: () => signOut(),
      color: theme.colors.error,
    },
  ];

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.menuItem} onPress={item.action}>
            <Ionicons name={item.icon} size={24} color={item.color || theme.colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: item.color || theme.colors.textPrimary }]}>
              {item.title}
            </Text>
            <Ionicons name="chevron-forward-outline" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={ItemSeparator}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingBottom: theme.spacing.s24,
  },
  title: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.s16,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.s16,
    borderRadius: theme.radii.md,
  },
  menuItemText: {
    flex: 1,
    marginLeft: theme.spacing.s16,
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textPrimary,
  },
  separator: {
    height: theme.spacing.s8,
  },
});

export default ProfileScreen;
