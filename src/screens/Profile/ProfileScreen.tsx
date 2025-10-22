/**
 * @description
 * Redesigned Profile screen with modern fintech UI featuring card-based layout,
 * enhanced icons, and professional styling. Displays user information and provides
 * navigation to various settings and profile-related features.
 *
 * @dependencies
 * - react-native: For core UI components
 * - @/components/ScreenWrapper: For consistent screen layout
 * - @react-navigation/native: For the `useNavigation` hook
 * - @expo/vector-icons: For icons in the settings list
 */
import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import EnhancedCard from '@/components/EnhancedCard';
import { theme } from '@/constants/theme';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useUser } from '@clerk/clerk-expo';

type ProfileScreenNavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

// Move ItemSeparatorComponent outside of render to avoid unstable nested components warning
const ItemSeparator = () => <View style={styles.separator} />;

const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { signOut } = useAuth();
  const { user } = useUser();

  const menuItems = [
    {
      title: 'Linked Accounts',
      icon: 'link' as const,
      description: 'Manage your connected bank accounts',
      action: () => navigation.navigate('Beneficiaries'),
      color: theme.colors.primary,
      bgColor: theme.colors.primaryLight,
    },
    {
      title: 'Receiving Preferences',
      icon: 'wallet' as const,
      description: 'Configure payment receiving settings',
      action: () => navigation.navigate('ReceivingPreferences'),
      color: theme.colors.info,
      bgColor: '#EFF6FF', // Blue 50
    },
    {
      title: 'Subscription',
      icon: 'card' as const,
      description: 'View and manage your subscription',
      action: () => navigation.navigate('Subscription'),
      color: theme.colors.accent,
      bgColor: '#F5F3FF', // Purple 50
    },
    {
      title: 'Security',
      icon: 'shield-checkmark' as const,
      description: 'Security and privacy settings',
      action: () => navigation.navigate('SecuritySettings'),
      color: theme.colors.success,
      bgColor: '#D1FAE5', // Green 100
    },
  ];

  const renderMenuItem = ({ item }: { item: (typeof menuItems)[0] }) => (
    <TouchableOpacity onPress={item.action} activeOpacity={0.7}>
      <View style={styles.menuItem}>
        <View style={[styles.menuIconContainer, { backgroundColor: item.bgColor }]}>
          <Ionicons name={item.icon} size={24} color={item.color} />
        </View>
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>{item.title}</Text>
          <Text style={styles.menuItemDescription}>{item.description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper>
      {/* Header with User Info */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={32} color={theme.colors.primary} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.userName}>
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : user?.firstName || 'User'}
            </Text>
            {user?.primaryEmailAddress && (
              <Text style={styles.userEmail}>{user.primaryEmailAddress.emailAddress}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Account Settings</Text>
        <EnhancedCard variant="elevated" style={styles.menuCard}>
          <FlatList
            data={menuItems}
            keyExtractor={(item) => item.title}
            renderItem={renderMenuItem}
            ItemSeparatorComponent={ItemSeparator}
            scrollEnabled={false}
          />
        </EnhancedCard>
      </View>

      {/* Sign Out Button */}
      <EnhancedCard variant="outlined" style={styles.signOutCard}>
        <TouchableOpacity onPress={() => signOut()} style={styles.signOutButton}>
          <View style={styles.signOutIconContainer}>
            <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
          </View>
          <Text style={styles.signOutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.error} />
        </TouchableOpacity>
      </EnhancedCard>

      {/* App Version */}
      <Text style={styles.versionText}>Version 1.0.0</Text>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: theme.spacing.s24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s16,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
    marginBottom: theme.spacing.s4,
  },
  userName: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  userEmail: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  // Menu Section
  menuSection: {
    marginBottom: theme.spacing.s24,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s12,
    marginLeft: theme.spacing.s4,
  },
  menuCard: {
    padding: 0,
    marginVertical: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.s16,
    paddingHorizontal: theme.spacing.s16,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  menuItemDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.s16,
  },
  // Sign Out Section
  signOutCard: {
    padding: 0,
    marginVertical: theme.spacing.s8,
    borderColor: theme.colors.error,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.s16,
    paddingHorizontal: theme.spacing.s16,
  },
  signOutIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: '#FEE2E2', // Red 100
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  signOutText: {
    flex: 1,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.error,
  },
  versionText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s24,
  },
});

export default ProfileScreen;
