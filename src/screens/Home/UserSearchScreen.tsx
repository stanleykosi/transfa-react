import BackIcon from '@/assets/icons/back.svg';
import SearchIcon from '@/assets/icons/search-normal.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUserSearch } from '@/api/userDiscoveryApi';
import type { UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername } from '@/utils/username';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

const cleanUsername = (value: string) => normalizeUsername(value);
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

const avatarOptions = [Avatar1, Avatar2, Avatar3] as const;

const resolveAvatar = (seed: string) => {
  if (!seed) {
    return avatarOptions[0];
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash += seed.charCodeAt(index) * (index + 1);
  }

  return avatarOptions[hash % avatarOptions.length];
};

const SearchUserItem = memo(
  ({
    user,
    onSelect,
  }: {
    user: UserDiscoveryResult;
    onSelect: (user: UserDiscoveryResult) => void;
  }) => {
    const AvatarComponent = resolveAvatar(user.id || user.username);

    const handlePress = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(user);
    }, [onSelect, user]);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.userCard,
          pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
        ]}
        onPress={handlePress}
      >
        <AvatarComponent width={scale(50)} height={scale(50)} />

        <View style={styles.userInfo}>
          <View style={styles.usernameRow}>
            <Text style={styles.username}>{cleanUsername(user.username)}</Text>
            <VerifiedBadge width={scale(16)} height={scale(16)} />
          </View>
          <Text style={styles.fullName} numberOfLines={1}>
            {user.full_name || 'Transfa User'}
          </Text>
        </View>
      </Pressable>
    );
  }
);

const UserSearchScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const { data, isLoading } = useUserSearch(normalizedQuery, 20);
  const results = data?.users ?? [];

  const handleBack = useCallback(() => {
    Haptics.selectionAsync();
    navigation.goBack();
  }, [navigation]);

  const handleUserSelect = useCallback(
    (user: UserDiscoveryResult) => {
      navigation.navigate('UserProfileView', { user });
    },
    [navigation]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <BackIcon width={scale(24)} height={scale(24)} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <SearchIcon width={scale(20)} height={scale(20)} color="#FFFFFF" />
          <TextInput
            style={styles.input}
            placeholder="Search"
            placeholderTextColor="#999999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
      </View>

      <ScrollView
        style={styles.resultsContainer}
        contentContainerStyle={styles.resultsContent}
        showsVerticalScrollIndicator={false}
      >
        {normalizedQuery.length === 0 ? (
          <Text style={styles.helperText}>Type a username to find users.</Text>
        ) : isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#FFD300" />
          </View>
        ) : results.length === 0 ? (
          <Text style={styles.helperText}>No users found.</Text>
        ) : (
          <View style={styles.resultsList}>
            {results.map((user) => (
              <SearchUserItem key={user.id} user={user} onSelect={handleUserSelect} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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
    zIndex: 0,
  },
  header: {
    height: verticalScale(60),
    justifyContent: 'center',
    paddingHorizontal: scale(20),
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    justifyContent: 'center',
  },
  searchBarContainer: {
    paddingHorizontal: scale(20),
    marginBottom: verticalScale(20),
  },
  searchBar: {
    height: verticalScale(35),
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: scale(1),
    borderRadius: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    gap: scale(10),
    borderCurve: 'continuous',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: moderateScale(18),
    fontFamily: 'Montserrat_400Regular',
  },
  helperText: {
    marginTop: verticalScale(8),
    color: '#9C9EA1',
    fontSize: moderateScale(14),
    fontFamily: 'Montserrat_400Regular',
  },
  centerState: {
    marginTop: verticalScale(24),
    alignItems: 'center',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(24),
  },
  resultsList: {
    gap: verticalScale(16),
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(10),
    padding: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    borderCurve: 'continuous',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: verticalScale(3),
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: verticalScale(2),
  },
  username: {
    fontSize: moderateScale(18),
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  fullName: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
});

export default UserSearchScreen;
