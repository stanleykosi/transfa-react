import AnimatedPageWrapper from '@/components/AnimatedPageWrapper';
import BottomNavbar from '@/components/bottom-navbar';
import type { NavItem } from '@/components/bottom-navbar';
import { fetchKycStatus } from '@/api/authApi';
import { useAuth } from '@/hooks/useAuth';
import type { AppStackParamList } from '@/types/navigation';
import type { ProfileStackParamList } from '@/types/navigation';
import { useSecurityStore } from '@/store/useSecurityStore';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Alert,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

type SettingsNav = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>,
  NativeStackNavigationProp<AppStackParamList>
>;

type SettingsItem = {
  id: string;
  label: string;
  value?: string;
  hasArrow?: boolean;
  onPress?: () => void;
  rightElement?: React.ReactNode;
};

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

const SettingsRow = ({ item, isLast }: { item: SettingsItem; isLast: boolean }) => {
  const content = (
    <View style={[styles.settingsItem, !isLast && styles.itemBorder]}>
      <Text style={styles.itemLabel}>{item.label}</Text>
      <View style={styles.itemRight}>
        {item.value ? <Text style={styles.itemValue}>{item.value}</Text> : null}
        {item.rightElement}
        {item.hasArrow ? <Text style={styles.itemArrow}>›</Text> : null}
      </View>
    </View>
  );

  if (item.onPress) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={item.onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const ProfileScreen = () => {
  const navigation = useNavigation<SettingsNav>();
  const { signOut } = useAuth();
  const { biometricsEnabled, setBiometricsEnabled } = useSecurityStore();

  const { data: kycStatus } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: fetchKycStatus,
  });

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const verificationLabel = (kycStatus?.current_tier ?? 1) >= 2 ? 'Verified' : 'Unverified';

  const openPlaceholder = (title: string) => {
    Alert.alert(title, 'This option will be enabled in a follow-up update.');
  };

  const settingsData: SettingsSection[] = [
    {
      title: 'Account',
      items: [
        {
          id: '1',
          label: 'Edit Profile',
          hasArrow: true,
          onPress: () => openPlaceholder('Edit Profile'),
        },
        {
          id: '2',
          label: 'Change PIN',
          hasArrow: true,
          onPress: () => navigation.navigate('PinSettings'),
        },
        {
          id: '3',
          label: 'Verification',
          value: verificationLabel,
          hasArrow: true,
          onPress: () => navigation.navigate('KycLevel'),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          id: '4',
          label: 'Notifications',
          hasArrow: true,
          onPress: () => navigation.navigate('NotificationCenter'),
        },
        {
          id: '5',
          label: 'Currency',
          value: 'NGN (₦)',
          hasArrow: true,
          onPress: () => openPlaceholder('Currency'),
        },
        {
          id: '6',
          label: 'Language',
          value: 'English',
          hasArrow: true,
          onPress: () => openPlaceholder('Language'),
        },
      ],
    },
    {
      title: 'Security',
      items: [
        {
          id: '7',
          label: 'Biometric Login',
          hasArrow: false,
          rightElement: (
            <Switch
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: '#4A4A4A', true: '#FFD300' }}
              thumbColor={biometricsEnabled ? '#111111' : '#F2F2F2'}
            />
          ),
        },
        {
          id: '8',
          label: 'Two-Factor Auth',
          hasArrow: true,
          onPress: () => openPlaceholder('Two-Factor Auth'),
        },
        {
          id: '9',
          label: 'Active Sessions',
          hasArrow: true,
          onPress: () => openPlaceholder('Active Sessions'),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: '10',
          label: 'Terms of Service',
          hasArrow: true,
          onPress: () => openPlaceholder('Terms of Service'),
        },
        {
          id: '11',
          label: 'Privacy Policy',
          hasArrow: true,
          onPress: () => openPlaceholder('Privacy Policy'),
        },
        {
          id: '12',
          label: 'App Version',
          value: appVersion,
          hasArrow: false,
        },
      ],
    },
  ];

  const handleTabPress = (tab: NavItem) => {
    if (tab === 'home') {
      navigation.navigate('AppTabs', { screen: 'Home' });
      return;
    }

    if (tab === 'settings') {
      navigation.navigate('AppTabs', { screen: 'Settings', params: { screen: 'ProfileHome' } });
      return;
    }

    if (tab === 'gifts') {
      navigation.navigate('AppTabs', { screen: 'MoneyDrop' });
      return;
    }

    navigation.navigate('AppTabs', { screen: 'Support' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.backgroundContainer} pointerEvents="none">
        <SvgXml
          xml={backgroundSvg}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          pointerEvents="none"
        />
      </View>

      <AnimatedPageWrapper>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>SETTINGS</Text>

          {settingsData.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, idx) => (
                  <SettingsRow
                    key={item.id}
                    item={item}
                    isLast={idx === section.items.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.logoutButton}
            activeOpacity={0.75}
            onPress={() => signOut()}
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </AnimatedPageWrapper>

      <BottomNavbar activeTab="settings" onTabPress={handleTabPress} visible />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  itemLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemValue: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  itemArrow: {
    color: '#6C6B6B',
    fontSize: 22,
    fontFamily: 'Montserrat_400Regular',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
    marginTop: 8,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
});

export default ProfileScreen;
