import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useUserProfile, useReceivingPreference } from '@/api/transactionApi';
import { useListBeneficiaries } from '@/api/accountApi';
import { fetchKycStatus } from '@/api/authApi';
import { useSecurityStore } from '@/store/useSecurityStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

type TabType = 'profile' | 'account';

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const rowIcon = (name: React.ComponentProps<typeof Ionicons>['name']) => (
  <Ionicons name={name} size={20} color="#EDEDED" />
);

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { signOut } = useAuth();
  const { data: userProfile } = useUserProfile();
  const { data: receivingPreference } = useReceivingPreference();
  const { data: beneficiaries } = useListBeneficiaries();
  const { biometricsEnabled, setBiometricsEnabled } = useSecurityStore();

  const { data: kycStatus, isLoading: isKycLoading } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: fetchKycStatus,
  });

  const [activeTab, setActiveTab] = useState<TabType>('profile');

  const displayName = useMemo(() => {
    if (userProfile?.username && userProfile.username.trim() !== '') {
      return userProfile.username;
    }
    if (userProfile?.full_name && userProfile.full_name.trim() !== '') {
      return userProfile.full_name;
    }
    return 'Transfa User';
  }, [userProfile?.full_name, userProfile?.username]);

  const receivingLabel = useMemo(() => {
    if (!receivingPreference?.use_external_account) {
      return 'In-App Wallet';
    }

    const selectedExternalBeneficiary =
      beneficiaries?.find((item) => item.id === receivingPreference.default_beneficiary_id) ||
      beneficiaries?.find((item) => item.is_default) ||
      beneficiaries?.[0];

    if (selectedExternalBeneficiary?.account_name) {
      return `${selectedExternalBeneficiary.account_name} (${selectedExternalBeneficiary.bank_name})`;
    }
    return 'External Account';
  }, [
    beneficiaries,
    receivingPreference?.default_beneficiary_id,
    receivingPreference?.use_external_account,
  ]);

  const accountRows = [
    {
      key: 'kyc',
      title: 'KYC level',
      icon: rowIcon('id-card-outline'),
      value: isKycLoading ? '...' : `Tier ${kycStatus?.current_tier ?? 1}`,
      onPress: () => navigation.navigate('KycLevel'),
    },
    {
      key: 'linked',
      title: 'Linked Account',
      icon: rowIcon('wallet-outline'),
      value: '',
      onPress: () => navigation.navigate('Beneficiaries'),
    },
    {
      key: 'destination',
      title: 'Receiving Destination',
      icon: rowIcon('card-outline'),
      value: receivingLabel,
      onPress: () => navigation.navigate('ReceivingPreferences'),
    },
    {
      key: 'pin',
      title: 'PIN',
      icon: rowIcon('lock-closed-outline'),
      value: '',
      onPress: () => navigation.navigate('PinSettings'),
    },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={60} color="#0D0E10" />
            </View>
            <View style={styles.avatarCameraBadge}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          </View>

          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.fullName}>{userProfile?.full_name || 'Complete your profile'}</Text>

          <View style={styles.tabPill}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
              onPress={() => setActiveTab('profile')}
            >
              <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
                User Profile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'account' && styles.tabButtonActive]}
              onPress={() => setActiveTab('account')}
            >
              <Text style={[styles.tabText, activeTab === 'account' && styles.tabTextActive]}>
                Account Settings
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'profile' ? (
            <View style={styles.group}>
              <InfoRow
                icon={rowIcon('mail-outline')}
                label="Email"
                value={userProfile?.email || 'Not set'}
              />
              <InfoRow
                icon={rowIcon('call-outline')}
                label="Phone number"
                value={userProfile?.phone_number || 'Not set'}
              />
              <InfoRow
                icon={rowIcon('shield-checkmark-outline')}
                label="Privacy and Permissions"
                value=""
                onPress={() =>
                  Alert.alert(
                    'Privacy & Permissions',
                    'This page will be enabled in a follow-up update.'
                  )
                }
              />
            </View>
          ) : (
            <View style={styles.group}>
              {accountRows.map((row) => (
                <InfoRow
                  key={row.key}
                  icon={row.icon}
                  label={row.title}
                  value={row.value}
                  onPress={row.onPress}
                />
              ))}

              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  {rowIcon('scan-circle-outline')}
                  <Text style={styles.switchLabel}>Enable Biometrics</Text>
                </View>
                <Switch
                  value={biometricsEnabled}
                  onValueChange={setBiometricsEnabled}
                  trackColor={{ false: '#5C5E62', true: '#FFD400' }}
                  thumbColor={biometricsEnabled ? '#111214' : '#EEEEEE'}
                />
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={() => signOut()}>
            <Ionicons name="log-out-outline" size={20} color="#FF2F2F" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const InfoRow = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
}) => {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color="#B5B6B8" /> : null}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.s20,
    paddingBottom: spacing.s32,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  avatarWrap: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5D7A2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  username: {
    marginTop: 12,
    textAlign: 'center',
    color: BRAND_YELLOW,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    letterSpacing: -0.8,
  },
  fullName: {
    marginTop: 2,
    textAlign: 'center',
    color: '#73767D',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  tabPill: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    padding: 4,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabText: {
    color: '#8A8D92',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  group: {
    marginTop: 18,
    gap: 10,
  },
  row: {
    minHeight: 62,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '58%',
  },
  rowLabel: {
    color: '#ECECEC',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  rowValue: {
    color: '#8E9095',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  switchRow: {
    minHeight: 62,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchLabel: {
    color: '#ECECEC',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  logoutButton: {
    marginTop: 34,
    minHeight: 62,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutText: {
    color: '#FF2F2F',
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
  },
});

export default ProfileScreen;
