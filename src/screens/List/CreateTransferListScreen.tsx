import BackIcon from '@/assets/icons/back.svg';
import EditIcon from '@/assets/icons/edit.svg';
import SearchIcon from '@/assets/icons/search.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import { useCreateTransferList } from '@/api/transactionApi';
import { useFrequentUsers, useUserSearch } from '@/api/userDiscoveryApi';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername, usernameKey } from '@/utils/username';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

const avatarComponents = [Avatar, Avatar1, Avatar2, Avatar3];

const avatarIndexFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return Math.abs(hash) % avatarComponents.length;
};

const getAvatarComponent = (index: number) => avatarComponents[index] || Avatar;

type DisplayUser = {
  id: string;
  username: string;
  fullName: string;
  avatarIndex: number;
  verified: boolean;
};

const CreateTransferListScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();

  const [listName, setListName] = useState('Name List');
  const [isEditingName, setIsEditingName] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Record<string, DisplayUser>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);

  const normalizedQuery = searchQuery.trim();
  const { data: searchData, isLoading: isSearching } = useUserSearch(normalizedQuery, 30);
  const { data: frequentData } = useFrequentUsers(40);

  const createMutation = useCreateTransferList({
    onSuccess: () => {
      navigation.replace('TransferLists');
    },
    onError: (error) => {
      Alert.alert('Could not create list', error.message || 'Please try again.');
    },
  });

  const displayUsers = useMemo<DisplayUser[]>(() => {
    const source =
      normalizedQuery.length > 0 ? (searchData?.users ?? []) : (frequentData?.users ?? []);

    const seen = new Set<string>();
    const unique = source.filter((user) => {
      const key = usernameKey(user.username);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return unique
      .map((user) => ({
        id: user.id,
        username: normalizeUsername(user.username),
        fullName: user.full_name || 'Transfa User',
        avatarIndex: avatarIndexFromSeed(user.username),
        verified: true,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [frequentData?.users, normalizedQuery.length, searchData?.users]);

  const selectedUsersList = useMemo(
    () => Object.values(selectedUsers).sort((a, b) => a.username.localeCompare(b.username)),
    [selectedUsers]
  );

  const selectedFilteredUsers = useMemo(() => {
    if (!normalizedQuery) {
      return selectedUsersList;
    }

    const query = normalizedQuery.toLowerCase();
    return selectedUsersList.filter(
      (user) =>
        user.username.toLowerCase().includes(query) || user.fullName.toLowerCase().includes(query)
    );
  }, [normalizedQuery, selectedUsersList]);

  const groupedUsers = useMemo(() => {
    const selectedKeys = new Set(Object.keys(selectedUsers));
    const remainingUsers = displayUsers.filter(
      (user) => !selectedKeys.has(usernameKey(user.username))
    );

    const groups: Record<string, DisplayUser[]> = {};
    remainingUsers.forEach((user) => {
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
  }, [displayUsers, selectedUsers]);

  const selectedCount = selectedUsersList.length;

  const toggleUserSelection = (user: DisplayUser) => {
    const key = usernameKey(user.username);

    setSelectedUsers((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }

      if (Object.keys(prev).length >= 10) {
        Alert.alert('Limit reached', 'A list can contain at most 10 users.');
        return prev;
      }

      return {
        ...prev,
        [key]: user,
      };
    });
  };

  const handleSave = async () => {
    if (selectedCount === 0) {
      Alert.alert('No users selected', 'Choose at least one user before saving this list.');
      return;
    }

    const trimmedName = listName.trim();
    if (!trimmedName || trimmedName === 'Name List') {
      setShowErrorModal(true);
      return;
    }

    await createMutation.mutateAsync({
      name: trimmedName,
      member_usernames: selectedUsersList
        .map((entry) => normalizeUsername(entry.username))
        .filter(Boolean),
    });
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleContainer}>
            {isEditingName ? (
              <TextInput
                style={styles.titleInput}
                value={listName}
                onChangeText={setListName}
                autoFocus
                onBlur={() => setIsEditingName(false)}
                returnKeyType="done"
                onSubmitEditing={() => setIsEditingName(false)}
              />
            ) : (
              <TouchableOpacity
                style={styles.titleWrapper}
                onPress={() => setIsEditingName(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.title}>{listName}</Text>
                <View>
                  <EditIcon width={20} height={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
          </View>

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

          {selectedFilteredUsers.length > 0 && (
            <View style={styles.selectedSection}>
              {selectedFilteredUsers.map((user) => {
                const AvatarComponent = getAvatarComponent(user.avatarIndex);
                return (
                  <TouchableOpacity
                    key={`selected-${user.id}`}
                    style={styles.userCard}
                    onPress={() => toggleUserSelection(user)}
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
                      <View style={[styles.checkbox, styles.checkboxChecked]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={styles.listHeaderContainer}>
            <Text style={styles.sectionTitle}>Suggestions</Text>
          </View>

          <View style={styles.usersSection}>
            {isSearching ? (
              <ActivityIndicator size="small" color="#FFD300" />
            ) : groupedUsers.length > 0 ? (
              groupedUsers.map((group) => (
                <View key={group.letter} style={styles.letterGroup}>
                  <Text style={styles.letterHeader}>{group.letter}</Text>

                  {group.users.map((user) => {
                    const AvatarComponent = getAvatarComponent(user.avatarIndex);
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={styles.userCard}
                        onPress={() => toggleUserSelection(user)}
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
                          <View style={[styles.checkbox, styles.checkboxUnchecked]} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No users found</Text>
            )}
          </View>
        </ScrollView>

        <View style={styles.saveButtonContainer}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (createMutation.isPending || selectedCount === 0) && styles.saveButtonDisabled,
            ]}
            onPress={() => {
              handleSave().catch(() => undefined);
            }}
            activeOpacity={0.8}
            disabled={createMutation.isPending || selectedCount === 0}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#111111" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        transparent
        visible={showErrorModal}
        onRequestClose={() => setShowErrorModal(false)}
      >
        <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowErrorModal(false)}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>You can&apos;t have an empty title</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.modalBody}>
                <Text style={styles.modalMessage}>Please enter a name for your List</Text>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    setShowErrorModal(false);
                    setIsEditingName(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </BlurView>
      </Modal>
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
  titleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
  },
  titleInput: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FFD300',
    paddingBottom: 4,
    minWidth: 150,
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
  selectedSection: {
    marginBottom: 24,
  },
  listHeaderContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.8,
  },
  usersSection: {
    marginBottom: 24,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    height: 80,
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
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADADA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxUnchecked: {
    borderColor: '#DADADA',
    borderWidth: 2,
  },
  checkboxChecked: {
    backgroundColor: '#FFD300',
    borderColor: '#FFD300',
  },
  saveButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    paddingHorizontal: 20,
  },
  saveButton: {
    backgroundColor: '#FFD300',
    width: '65%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    width: '80%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#000000',
    marginHorizontal: 25,
  },
  modalTitle: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
  },
  modalBody: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '60%',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
  },
});

export default CreateTransferListScreen;
