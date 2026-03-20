import AvatarDefaultIcon from '@/assets/icons/avatar-default.svg';
import Eyeslash from '@/assets/icons/eyeSlash.svg';
import List from '@/assets/icons/list.svg';
import NotificationIcon from '@/assets/icons/notification.svg';
import Recieve from '@/assets/icons/recieve.svg';
import Scan from '@/assets/icons/scan.svg';
import Search from '@/assets/icons/search-normal.svg';
import Send from '@/assets/icons/send.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import WalletPlusIcon from '@/assets/icons/wallet.svg';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';

import AnimatedPageWrapper from '@/components/AnimatedPageWrapper';
import BottomNavbar from '@/components/bottom-navbar';
import UserProfileModal from '@/components/UserProfileModal';
import WalletModal from '@/components/WalletModal';
import { AppNavigationProp } from '@/types/navigation';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  FadeInUp,
  interpolate,
  runOnJS,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="white"/>
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<rect width="375" height="812" fill="black" fill-opacity="0.2"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

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
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(40),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(48),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: scale(12),
  },
  defaultAvatarContainerHeader: {
    width: scale(49),
    height: scale(49),
    backgroundColor: '#000000',
    borderRadius: scale(16),
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultAvatarContainerSmall: {
    width: scale(60),
    height: scale(60),
    backgroundColor: '#000000',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: scale(18),
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeContainer: {
    justifyContent: 'center',
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: moderateScale(18),
    color: '#6C6B6B',
    marginRight: scale(6),
    fontFamily: 'Montserrat_400Regular',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: moderateScale(20),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginRight: scale(4),
  },
  headerRight: {
    flexDirection: 'row',
    gap: scale(16),
  },
  iconButton: {
    padding: scale(4),
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: SCREEN_HEIGHT * 0.048,
  },
  balanceLabel: {
    fontSize: moderateScale(16),
    color: '#ffffff',
    marginBottom: SCREEN_HEIGHT * 0.015,
    fontFamily: 'Montserrat_500Medium',
    letterSpacing: 1.2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SCREEN_WIDTH * 0.03,
  },
  balanceAmount: {
    fontSize: moderateScale(40),
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
  },
  eyeButton: {
    // paddingVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SCREEN_HEIGHT * 0.035,
    gap: SCREEN_WIDTH * 0.05,
  },
  actionButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: scale(20),
    height: verticalScale(90),
    width: scale(30),
    paddingHorizontal: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderCurve: 'continuous',
  },
  actionButtonIcon: {
    marginBottom: verticalScale(14),
  },
  actionButtonText: {
    fontSize: moderateScale(20),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  findUsersSection: {
    marginBottom: scale(8),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(16),
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  searchButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: scale(10),
    paddingVertical: verticalScale(5),
    paddingHorizontal: scale(20),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    borderCurve: 'continuous',
  },
  searchButtonText: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  usersList: {
    flexDirection: 'row',
    gap: scale(6),
  },
  userItem: {
    width: SCREEN_WIDTH * 0.225,
  },
  userAvatarContainer: {
    marginBottom: scale(4),
    position: 'relative',
    width: scale(60),
    height: scale(60),
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconContainer: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(20),
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: scale(15),
    height: scale(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    width: scale(60),
    marginTop: SCREEN_HEIGHT * 0.008,
  },
  searchText: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
    width: scale(60),
    marginTop: SCREEN_HEIGHT * 0.008,
  },
  transactionSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: scale(20),
    padding: SCREEN_WIDTH * 0.02,
    marginTop: scale(8),
    borderCurve: 'continuous',
  },
  transactionsList: {
    gap: verticalScale(12),
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderRadius: scale(12),
    padding: scale(12),
    borderCurve: 'continuous',
  },
  sheetTransactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: scale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(16),
    marginBottom: verticalScale(12),
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  transactionAvatars: {
    marginRight: scale(12),
    width: scale(44),
    height: scale(44),
  },
  avatarOverlap: {
    width: scale(44),
    height: scale(44),
    position: 'relative',
  },
  avatarBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
    transform: [{ rotate: '-15deg' }],
  },
  avatarFront: {
    position: 'absolute',
    left: scale(15),
    top: scale(15),
    zIndex: 2,
    transform: [{ rotate: '15deg' }],
  },
  transactionDetails: {
    flex: 1,
    marginRight: scale(12),
    marginLeft: scale(12),
  },
  sheetTransactionDescription: {
    fontSize: moderateScale(14),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    maxWidth: '80%',
  },
  sheetTransactionAmount: {
    fontSize: moderateScale(16),
    fontFamily: 'Montserrat_400Regular',
  },
  sentAmount: {
    color: '#000000',
  },
  receivedAmount: {
    color: '#000000',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    marginBottom: verticalScale(20),
  },
  sheetHeaderLeft: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: moderateScale(18),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  sheetShowAllButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: scale(10),
    paddingVertical: verticalScale(6),
    width: scale(110),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderCurve: 'continuous',
  },
  sheetShowAllText: {
    fontSize: moderateScale(17),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
});

interface Transaction {
  id: string;
  type: 'sent' | 'received';
  description: string;
  amount: number;
  otherUserAvatar?: string;
}

interface User {
  id: string;
  name: string;
  username: string;
  fullName: string;
  avatar?: React.ComponentType<{ width?: number; height?: number }> | null;
  avatarKey: string;
  verified: boolean;
}

const MemoUserItem = memo(({ user, onSelect }: { user: User; onSelect: (user: User) => void }) => {
  const AvatarComponent = user.avatar;
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(user);
  }, [user, onSelect]);

  return (
    <Pressable
      style={({ pressed }) => [styles.userItem, pressed && { opacity: 0.7 }]}
      onPress={handlePress}
    >
      <View style={styles.userAvatarContainer}>
        {AvatarComponent ? (
          <AvatarComponent width={scale(60)} height={scale(60)} />
        ) : (
          <View style={styles.defaultAvatarContainerSmall}>
            <AvatarDefaultIcon width={scale(30)} height={scale(30)} color="#ffffff" />
          </View>
        )}
        {user.verified ? (
          <View style={styles.verifiedBadgeContainer}>
            <VerifiedBadge width={scale(20)} height={scale(20)} />
          </View>
        ) : null}
      </View>
      <Text style={styles.userName} numberOfLines={1}>
        {user.name}
      </Text>
    </Pressable>
  );
});

const avatarMap: Record<string, React.ComponentType<{ width?: number; height?: number }>> = {
  avatar: Avatar,
  avatar1: Avatar1,
  avatar2: Avatar2,
  avatar3: Avatar3,
};

const MemoTransactionItem = memo(
  ({
    transaction,
    index,
    hasAnimated,
    formatAmount,
    onComplete,
  }: {
    transaction: Transaction;
    index: number;
    hasAnimated: boolean;
    formatAmount: (val: number) => string;
    onComplete: (idx: number) => void;
  }) => {
    const isSent = transaction.type === 'sent';
    const OtherUserAvatar = avatarMap[transaction.otherUserAvatar || 'avatar1'] || Avatar1;
    const CurrentUserAvatar = Avatar;

    return (
      <Animated.View
        entering={
          !hasAnimated
            ? FadeInUp.delay(index * 20)
                .duration(120)
                .springify()
                .damping(28)
                .stiffness(200)
                .withInitialValues({
                  opacity: 0,
                  transform: [{ translateY: 4 }],
                })
                .withCallback((finished) => {
                  if (finished) {
                    runOnJS(onComplete)(index);
                  }
                })
            : undefined
        }
        style={styles.sheetTransactionItem}
      >
        <View style={styles.transactionAvatars}>
          <View style={styles.avatarOverlap}>
            <View style={styles.avatarBack}>
              {isSent ? (
                <CurrentUserAvatar width={scale(32)} height={scale(32)} />
              ) : (
                <OtherUserAvatar width={scale(32)} height={scale(32)} />
              )}
            </View>
            <View style={styles.avatarFront}>
              {isSent ? (
                <OtherUserAvatar width={scale(32)} height={scale(32)} />
              ) : (
                <CurrentUserAvatar width={scale(32)} height={scale(32)} />
              )}
            </View>
          </View>
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.sheetTransactionDescription} numberOfLines={2}>
            {transaction.description}
          </Text>
        </View>
        <Text
          style={[
            styles.sheetTransactionAmount,
            transaction.type === 'sent' ? styles.sentAmount : styles.receivedAmount,
          ]}
        >
          {transaction.type === 'sent' ? '-' : '+'}
          {formatAmount(transaction.amount)}
        </Text>
      </Animated.View>
    );
  }
);

export default function HomeScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [username] = useState('_Huncho25_');
  const [balance] = useState(481296.89);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const hasAnimatedTransactions = useRef(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['35%', '85%'], []);

  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [userProfileModalVisible, setUserProfileModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const sheetAnimatedIndex = useSharedValue(0);

  const navbarVisibility = useDerivedValue(() => {
    if (!isNavbarVisible) return 0;
    return interpolate(sheetAnimatedIndex.value, [0, 1], [1, 0]);
  });

  const transactions: Transaction[] = [
    {
      id: '1',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO BGGRMN26 - B69',
      amount: 50000,
      otherUserAvatar: 'avatar2',
    },
    {
      id: '2',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO BGGRMN26 - B69',
      amount: 15000,
      otherUserAvatar: 'avatar2',
    },
    {
      id: '3',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO BGGRMN26 - B69',
      amount: 50000,
      otherUserAvatar: 'avatar2',
    },
    {
      id: '4',
      type: 'received',
      description: 'TRF FRM USER123 TO _HNCH25 - B70',
      amount: 25000,
      otherUserAvatar: 'avatar1',
    },
    {
      id: '5',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO USER456 - B71',
      amount: 30000,
      otherUserAvatar: 'avatar3',
    },
    {
      id: '6',
      type: 'received',
      description: 'TRF FRM USER789 TO _HNCH25 - B72',
      amount: 75000,
      otherUserAvatar: 'avatar1',
    },
    {
      id: '7',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO USER101 - B73',
      amount: 10000,
      otherUserAvatar: 'avatar2',
    },
    {
      id: '8',
      type: 'received',
      description: 'TRF FRM USER202 TO _HNCH25 - B74',
      amount: 45000,
      otherUserAvatar: 'avatar3',
    },
    {
      id: '9',
      type: 'sent',
      description: 'TRF FRM _HNCH25 TO USER303 - B75',
      amount: 20000,
      otherUserAvatar: 'avatar1',
    },
    {
      id: '10',
      type: 'received',
      description: 'TRF FRM USER404 TO _HNCH25 - B76',
      amount: 60000,
      otherUserAvatar: 'avatar2',
    },
  ];

  const users: User[] = [
    {
      id: '1',
      name: 'Titi_2...',
      username: 'Titi_823',
      fullName: 'Oluwatiti Adenuga',
      avatar: Avatar1,
      avatarKey: 'avatar1',
      verified: true,
    },
    {
      id: '2',
      name: '!Adeo...',
      username: '!Adeo',
      fullName: 'Adeoluwa Johnson',
      avatar: Avatar2,
      avatarKey: 'avatar2',
      verified: false,
    },
    {
      id: '3',
      name: '_Bigg...',
      username: '_Bigg',
      fullName: 'Biggie Thompson',
      avatar: Avatar3,
      avatarKey: 'avatar3',
      verified: true,
    },
    {
      id: '4',
      name: 'gremlix',
      username: 'gremlix',
      fullName: 'Biggie Thompson',
      avatar: null,
      avatarKey: 'default',
      verified: true,
    },
    {
      id: '5',
      name: 'Choppa',
      username: 'choppa',
      fullName: 'Biggie Thompson',
      avatar: Avatar3,
      avatarKey: 'avatar3',
      verified: false,
    },
    {
      id: '6',
      name: 'Tomisin',
      username: 'Tomisin',
      fullName: 'Biggie Thompson',
      avatar: Avatar1,
      avatarKey: 'avatar1',
      verified: false,
    },
  ];

  const formatBalance = (amount: number) => {
    return `₦${amount.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatAmount = useCallback((amount: number) => {
    return `₦${amount.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    setIsSheetExpanded(index === 1);
  }, []);

  const handleUserSelect = useCallback((user: User) => {
    setSelectedUser(user);
    setUserProfileModalVisible(true);
  }, []);

  const handleToggleBalance = useCallback(() => {
    Haptics.selectionAsync();
    setBalanceVisible((prev) => !prev);
  }, []);

  const handleTransactionAnimationComplete = useCallback(
    (index: number) => {
      if (index === transactions.length - 1) {
        hasAnimatedTransactions.current = true;
      }
    },
    [transactions.length]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        opacity={0.4}
        pressBehavior="collapse"
      />
    ),
    []
  );

  const insets = useSafeAreaInsets();

  const handleTabPress = useCallback(
    (tab: 'home' | 'settings' | 'gifts' | 'support') => {
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
    },
    [navigation]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>
      <AnimatedPageWrapper>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: SCREEN_HEIGHT * 0.32 + scale(20) },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isSheetExpanded}
          pointerEvents={isSheetExpanded ? 'none' : 'auto'}
          onScroll={(event) => {
            const currentScrollY = event.nativeEvent.contentOffset.y;
            scrollY.value = currentScrollY;

            // Hide navbar when scrolling down, show when scrolling up or at top
            if (currentScrollY > lastScrollY.value && currentScrollY > 50) {
              // Scrolling down and past threshold
              if (isNavbarVisible) {
                setIsNavbarVisible(false);
              }
            } else if (currentScrollY < lastScrollY.value || currentScrollY <= 50) {
              // Scrolling up or near top
              if (!isNavbarVisible) {
                setIsNavbarVisible(true);
              }
            }

            lastScrollY.value = currentScrollY;
          }}
          scrollEventThrottle={16}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Pressable
                style={styles.avatarContainer}
                onPress={() =>
                  navigation.navigate('AppTabs', {
                    screen: 'Settings',
                    params: { screen: 'ProfileHome' },
                  })
                }
              >
                {Avatar ? (
                  <Avatar width={scale(49)} height={scale(49)} />
                ) : (
                  <View style={styles.defaultAvatarContainerHeader}>
                    <AvatarDefaultIcon width={scale(28)} height={scale(28)} color="#ffffff" />
                  </View>
                )}
              </Pressable>
              <View style={styles.welcomeContainer}>
                <View style={styles.welcomeRow}>
                  <Text style={styles.welcomeText}>Welcome back 👋</Text>
                </View>
                <View style={styles.usernameRow}>
                  <Text style={styles.username}>{username}</Text>
                  <VerifiedBadge width={scale(14)} height={scale(14)} />
                </View>
              </View>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWalletModalVisible(true);
                }}
              >
                <WalletPlusIcon width={scale(24)} height={scale(24)} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  navigation.navigate('NotificationCenter');
                }}
              >
                <NotificationIcon width={scale(24)} height={scale(24)} fill="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Available Balance Section */}
          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceAmount}>
                {balanceVisible ? formatBalance(balance) : '••••••••'}
              </Text>
              <Pressable
                onPress={handleToggleBalance}
                style={({ pressed }) => [
                  styles.eyeButton,
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Eyeslash width={scale(20)} height={scale(20)} />
              </Pressable>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('PayUser');
              }}
            >
              <View style={styles.actionButtonIcon}>
                <Send width={scale(24)} height={scale(24)} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>Send</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('Scan');
              }}
            >
              <View style={styles.actionButtonIcon}>
                <Scan width={scale(24)} height={scale(24)} />
              </View>
              <Text style={styles.actionButtonText}>Scan</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('PaymentRequestsList');
              }}
            >
              <View style={styles.actionButtonIcon}>
                <Recieve width={scale(24)} height={scale(24)} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>Receive</Text>
            </Pressable>
          </View>

          {/* Find Users Section */}
          <View style={styles.findUsersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Find Users</Text>
              <Pressable
                style={styles.searchButton}
                onPress={() => navigation.navigate('UserSearch')}
              >
                <Search color="#FFFFFF" width={scale(20)} height={scale(20)} />
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.usersList}
            >
              <Pressable
                style={({ pressed }) => [styles.userItem, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  navigation.navigate('TransferLists');
                }}
              >
                <View style={styles.searchIconContainer}>
                  <List width={scale(30)} height={scale(30)} />
                </View>
                <Text style={styles.searchText}>List</Text>
              </Pressable>
              {users.map((user) => (
                <MemoUserItem key={user.id} user={user} onSelect={handleUserSelect} />
              ))}
            </ScrollView>
          </View>
        </Animated.ScrollView>
      </AnimatedPageWrapper>

      {/* Transaction History Bottom Sheet — lives outside AnimatedPageWrapper for stable gestures */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        animatedIndex={sheetAnimatedIndex}
        enablePanDownToClose={false}
        enableOverDrag={false}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: '#CCCCCC',
          width: SCREEN_WIDTH * 0.15,
        }}
        backgroundStyle={{
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
        }}
      >
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderLeft}>
            <Text style={styles.sheetTitle}>Transaction History</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.sheetShowAllButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              Haptics.selectionAsync();
              if (isSheetExpanded) {
                bottomSheetRef.current?.collapse();
              } else {
                bottomSheetRef.current?.snapToIndex(1);
              }
            }}
          >
            <Text style={styles.sheetShowAllText}>
              {isSheetExpanded ? 'Show less' : 'Show all'}
            </Text>
          </Pressable>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {transactions.map((transaction, index) => (
            <MemoTransactionItem
              key={transaction.id}
              transaction={transaction}
              index={index}
              hasAnimated={hasAnimatedTransactions.current}
              formatAmount={formatAmount}
              onComplete={handleTransactionAnimationComplete}
            />
          ))}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Bottom Navigation Bar */}
      <BottomNavbar
        activeTab="home"
        onTabPress={handleTabPress}
        visibilityValue={navbarVisibility}
      />

      {/* Wallet Modal */}
      <WalletModal visible={walletModalVisible} onClose={() => setWalletModalVisible(false)} />

      {/* User Profile Modal */}
      {selectedUser && (
        <UserProfileModal
          visible={userProfileModalVisible}
          onClose={() => {
            setUserProfileModalVisible(false);
            setSelectedUser(null);
          }}
          username={selectedUser.username}
          fullName={selectedUser.fullName}
          avatar={selectedUser.avatarKey}
          verified={selectedUser.verified}
        />
      )}
    </View>
  );
}
