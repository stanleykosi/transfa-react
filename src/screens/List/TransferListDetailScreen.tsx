import BackIcon from '@/assets/icons/back.svg';
import SearchIcon from '@/assets/icons/search.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import { useGetTransferList, useToggleTransferListMember } from '@/api/transactionApi';
import { useUserSearch } from '@/api/userDiscoveryApi';
import type { AppStackParamList } from '@/types/navigation';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername, usernameKey } from '@/utils/username';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
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

const avatarComponents = [Avatar, Avatar1, Avatar2, Avatar3];

const avatarIndexFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return Math.abs(hash) % avatarComponents.length;
};

const getAvatarComponent = (index: number) => avatarComponents[index] || Avatar;

type ScreenRoute = RouteProp<AppStackParamList, 'TransferListDetail'>;

type DisplayUser = {
  id: string;
  username: string;
  fullName: string;
  avatarIndex: number;
  verified: boolean;
  rawUsername: string;
};

const TransferListDetailScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { listId } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);

  const { data: list, isLoading, refetch } = useGetTransferList(listId);
  const normalizedQuery = searchQuery.trim();
  const { data: searchData, isLoading: isSearching } = useUserSearch(normalizedQuery, 15);

  const toggleMutation = useToggleTransferListMember({
    onError: (error) => {
      Alert.alert('List update failed', error.message || 'Please try again.');
    },
  });

  const memberUsers = useMemo<DisplayUser[]>(
    () =>
      (list?.members ?? []).map((member) => ({
        id: member.user_id,
        username: normalizeUsername(member.username),
        fullName: member.full_name || 'Transfa User',
        avatarIndex: avatarIndexFromSeed(member.username),
        verified: true,
        rawUsername: member.username,
      })),
    [list?.members]
  );

  const memberUsernameSet = useMemo(() => {
    const values = new Set<string>();
    memberUsers.forEach((member) => values.add(usernameKey(member.rawUsername)));
    return values;
  }, [memberUsers]);

  const listMembers = useMemo(() => {
    if (!normalizedQuery) {
      return memberUsers;
    }

    const query = normalizedQuery.toLowerCase();
    return memberUsers.filter(
      (user) =>
        user.username.toLowerCase().includes(query) || user.fullName.toLowerCase().includes(query)
    );
  }, [memberUsers, normalizedQuery]);

  const groupedMembers = useMemo(() => {
    const groups: Record<string, DisplayUser[]> = {};

    listMembers.forEach((user) => {
      const firstLetter = user.username.charAt(0).toUpperCase() || '#';
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(user);
    });

    return Object.keys(groups)
      .sort()
      .map((letter) => ({
        letter,
        users: groups[letter].sort((a, b) => a.username.localeCompare(b.username)),
      }));
  }, [listMembers]);

  const suggestions = useMemo<DisplayUser[]>(() => {
    if (!normalizedQuery) {
      return [];
    }

    return (searchData?.users ?? [])
      .filter((user) => !memberUsernameSet.has(usernameKey(user.username)))
      .map((user) => ({
        id: user.id,
        username: normalizeUsername(user.username),
        fullName: user.full_name || 'Transfa User',
        avatarIndex: avatarIndexFromSeed(user.username),
        verified: true,
        rawUsername: user.username,
      }))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 3);
  }, [memberUsernameSet, normalizedQuery, searchData?.users]);

  const toggleUserSelection = (rawUsername: string) => {
    const normalized = usernameKey(rawUsername);
    setPendingUsername(normalized);

    toggleMutation.mutate(
      {
        listId,
        payload: { username: normalizeUsername(rawUsername) },
      },
      {
        onSuccess: () => {
          refetch();
        },
        onSettled: () => {
          setPendingUsername(null);
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BackIcon width={24} height={24} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{list?.name || 'Transfer List'}</Text>

        <View style={styles.searchContainer}>
          <View style={styles.searchIconContainer}>
            <SearchIcon width={16} height={16} color="#FFFFFF" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search user"
            placeholderTextColor="#6C6B6B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        {normalizedQuery.length > 0 && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsTitle}>Suggestions</Text>

            {isSearching ? (
              <ActivityIndicator size="small" color="#FFD300" />
            ) : suggestions.length > 0 ? (
              suggestions.map((user) => {
                const AvatarComponent = getAvatarComponent(user.avatarIndex);
                const isPending = pendingUsername === usernameKey(user.rawUsername);

                return (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.suggestionCard}
                    onPress={() => {
                      if (!isPending) {
                        toggleUserSelection(user.rawUsername);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.userAvatarContainer}>
                      <AvatarComponent width={40} height={40} />
                      {user.verified && (
                        <View style={styles.verifiedBadgeContainer}>
                          <VerifiedBadge width={12} height={12} />
                        </View>
                      )}
                    </View>

                    <View style={styles.userInfo}>
                      <View style={styles.usernameRow}>
                        <Text style={styles.suggestionUsername}>{user.username}</Text>
                        {user.verified && <VerifiedBadge width={12} height={12} />}
                      </View>
                      <Text style={styles.suggestionFullName}>{user.fullName}</Text>
                    </View>

                    <View style={styles.checkboxContainer}>
                      {isPending ? (
                        <ActivityIndicator size="small" color="#FFD300" />
                      ) : (
                        <View style={styles.checkboxUnchecked} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No users found</Text>
            )}
          </View>
        )}

        <View style={styles.usersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Members ({memberUsers.length})</Text>
            <TouchableOpacity
              style={[styles.payButton, memberUsers.length === 0 && styles.payButtonDisabled]}
              activeOpacity={0.7}
              disabled={memberUsers.length === 0}
              onPress={() => navigation.navigate('PayTransferList', { listId })}
            >
              <Text style={styles.payButtonText}>Pay</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#FFD300" />
            </View>
          ) : groupedMembers.length > 0 ? (
            groupedMembers.map((group) => (
              <View key={group.letter} style={styles.letterGroup}>
                <Text style={styles.letterHeader}>{group.letter}</Text>
                {group.users.map((user) => {
                  const AvatarComponent = getAvatarComponent(user.avatarIndex);
                  const isPending = pendingUsername === usernameKey(user.rawUsername);

                  return (
                    <TouchableOpacity
                      key={`${group.letter}-${user.id}`}
                      style={styles.userCard}
                      onPress={() => {
                        if (!isPending) {
                          toggleUserSelection(user.rawUsername);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.userAvatarContainer}>
                        <AvatarComponent width={48} height={48} />
                        {user.verified && (
                          <View style={styles.verifiedBadgeContainer}>
                            <VerifiedBadge width={15} height={15} />
                          </View>
                        )}
                      </View>

                      <View style={styles.userInfo}>
                        <View style={styles.usernameRow}>
                          <Text style={styles.username}>{user.username}</Text>
                          {user.verified && <VerifiedBadge width={15} height={15} />}
                        </View>
                        <Text style={styles.fullName}>{user.fullName}</Text>
                      </View>

                      <View style={styles.checkboxContainer}>
                        {isPending ? (
                          <ActivityIndicator size="small" color="#111111" />
                        ) : (
                          <View style={[styles.checkbox, styles.checkboxChecked]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No members found</Text>
          )}
        </View>
      </ScrollView>
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
    zIndex: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    zIndex: 1,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchIconContainer: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  suggestionsSection: {
    marginBottom: 24,
  },
  suggestionsTitle: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 12,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  suggestionUsername: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  suggestionFullName: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  usersSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  payButton: {
    backgroundColor: '#FFD300',
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
  letterGroup: {
    marginBottom: 24,
  },
  letterHeader: {
    fontSize: 18,
    color: '#FFD300',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  userAvatarContainer: {
    marginRight: 12,
    position: 'relative',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  fullName: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  checkboxContainer: {
    marginLeft: 12,
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 15,
    height: 15,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DADADA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FFD300',
    borderColor: '#DADADA',
  },
  checkboxUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DADADA',
  },
});

export default TransferListDetailScreen;
