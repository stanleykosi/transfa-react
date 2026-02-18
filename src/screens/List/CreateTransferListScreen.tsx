import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { useCreateTransferList } from '@/api/transactionApi';
import { useFrequentUsers, useUserSearch } from '@/api/userDiscoveryApi';
import type { AppNavigationProp } from '@/types/navigation';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';

const stripUsernamePrefix = (username?: string | null) => (username ?? '').replace(/^_+/, '');

const CreateTransferListScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<
    Record<string, { username: string; fullName?: string | null }>
  >({});
  const [listName, setListName] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showEmptyTitleModal, setShowEmptyTitleModal] = useState(false);
  const titleInputRef = useRef<TextInput | null>(null);

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

  const suggestions = useMemo(() => {
    const source =
      normalizedQuery.length > 0 ? (searchData?.users ?? []) : (frequentData?.users ?? []);
    const seen = new Set<string>();
    const unique = [] as typeof source;

    source.forEach((user) => {
      const key = stripUsernamePrefix(user.username).toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(user);
    });

    return unique;
  }, [frequentData?.users, normalizedQuery.length, searchData?.users]);

  const groupedSuggestions = useMemo(() => {
    const byLetter = new Map<string, typeof suggestions>();

    suggestions.forEach((user) => {
      const clean = stripUsernamePrefix(user.username);
      const letter = clean.slice(0, 1).toUpperCase() || '#';
      const bucket = byLetter.get(letter) ?? [];
      bucket.push(user);
      byLetter.set(letter, bucket);
    });

    return [...byLetter.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([letter, users]) => ({
        letter,
        users: users.sort((a, b) =>
          stripUsernamePrefix(a.username).localeCompare(stripUsernamePrefix(b.username))
        ),
      }));
  }, [suggestions]);

  const selectedCount = Object.keys(selected).length;

  const toggleUser = (username: string, fullName?: string | null) => {
    const clean = stripUsernamePrefix(username);
    const key = clean.toLowerCase();

    setSelected((prev) => {
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
        [key]: {
          username: clean,
          fullName,
        },
      };
    });
  };

  const focusTitleEditor = () => {
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 80);
  };

  const handleConfirmSave = async () => {
    if (selectedCount === 0) {
      Alert.alert('No users selected', 'Choose at least one user before saving this list.');
      return;
    }

    const trimmedName = listName.trim();
    if (!trimmedName) {
      setShowEmptyTitleModal(true);
      return;
    }

    await createMutation.mutateAsync({
      name: trimmedName,
      member_usernames: Object.values(selected).map((entry) => entry.username),
    });
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#ECECEC" />
        </TouchableOpacity>

        <View style={styles.titleRow}>
          {isEditingTitle ? (
            <TextInput
              ref={titleInputRef}
              style={styles.titleInput}
              value={listName}
              onChangeText={setListName}
              placeholder="Name List"
              placeholderTextColor="#8E9096"
              maxLength={80}
              autoCapitalize="words"
              onBlur={() => setIsEditingTitle(false)}
            />
          ) : (
            <Text style={styles.title}>{listName.trim() || 'Name List'}</Text>
          )}
          <TouchableOpacity
            onPress={() => {
              if (isEditingTitle) {
                setIsEditingTitle(false);
                return;
              }
              focusTitleEditor();
            }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons
              name={isEditingTitle ? 'checkmark-outline' : 'create-outline'}
              size={16}
              color="#B6B7BC"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#9FA1A7" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="#6F727A"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.selectedCounterWrap}>
          <Text style={styles.selectedCounterText}>Selected: {selectedCount}/10</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionLabel}>Suggestions</Text>

          {isSearching ? (
            <ActivityIndicator size="small" color={BRAND_YELLOW} />
          ) : groupedSuggestions.length === 0 ? (
            <Text style={styles.emptyText}>No user found</Text>
          ) : (
            groupedSuggestions.map((group) => (
              <View key={group.letter}>
                <Text style={styles.groupLetter}>{group.letter}</Text>

                {group.users.map((user) => {
                  const clean = stripUsernamePrefix(user.username);
                  const key = clean.toLowerCase();
                  const isSelected = !!selected[key];

                  return (
                    <View key={user.id} style={styles.userCard}>
                      <View style={styles.userInfo}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarInitial}>
                            {clean.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.userTextWrap}>
                          <Text style={styles.username}>{clean}</Text>
                          <Text style={styles.fullName}>{user.full_name || 'Transfa User'}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.toggleCircle, isSelected && styles.toggleCircleActive]}
                        onPress={() => toggleUser(clean, user.full_name)}
                      />
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.saveButton, selectedCount === 0 && styles.saveButtonDisabled]}
          disabled={selectedCount === 0}
          onPress={handleConfirmSave}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <Modal
        visible={showEmptyTitleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmptyTitleModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.errorModalCard}>
            <Text style={styles.errorTitle}>You can't have an empty title</Text>
            <Text style={styles.errorBody}>Please enter a name for your List</Text>

            <TouchableOpacity
              style={styles.okButton}
              onPress={() => {
                setShowEmptyTitleModal(false);
                focusTitleEditor();
              }}
            >
              <Text style={styles.okButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 28,
    marginTop: 4,
  },
  titleRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#F0F0F2',
    fontSize: 24,
    fontWeight: '700',
  },
  titleInput: {
    minWidth: 170,
    maxWidth: 240,
    height: 36,
    color: '#F0F0F2',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  searchWrap: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    height: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ECEDEF',
    fontSize: 16,
    paddingVertical: 0,
  },
  selectedCounterWrap: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  selectedCounterText: {
    color: '#B3B5BA',
    fontSize: 13,
  },
  scroll: {
    marginTop: 6,
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90,
  },
  sectionLabel: {
    color: '#9EA0A6',
    fontSize: 18,
    marginBottom: 8,
  },
  groupLetter: {
    marginTop: 8,
    marginBottom: 6,
    color: '#D4B315',
    fontSize: 16,
    fontWeight: '700',
  },
  userCard: {
    minHeight: 72,
    borderRadius: 11,
    backgroundColor: '#F4F4F4',
    marginBottom: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: {
    color: '#131313',
    fontSize: 16,
    fontWeight: '800',
  },
  userTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  username: {
    color: '#18191B',
    fontSize: 18,
    fontWeight: '700',
  },
  fullName: {
    marginTop: 1,
    color: '#5A5C61',
    fontSize: 14,
  },
  toggleCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#CACBD0',
    backgroundColor: '#FFFFFF',
  },
  toggleCircleActive: {
    borderColor: '#E6C111',
    backgroundColor: '#E6C111',
  },
  emptyText: {
    color: '#9EA0A6',
    fontSize: 15,
  },
  saveButton: {
    position: 'absolute',
    left: 110,
    right: 110,
    bottom: 20,
    height: 46,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: '#0D0E10',
    fontSize: 20,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  errorModalCard: {
    width: '88%',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  errorTitle: {
    color: '#121315',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    marginTop: 8,
    color: '#65676D',
    fontSize: 20,
    textAlign: 'center',
  },
  okButton: {
    marginTop: 12,
    width: '82%',
    height: 40,
    borderRadius: 7,
    backgroundColor: '#060708',
    alignItems: 'center',
    justifyContent: 'center',
  },
  okButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CreateTransferListScreen;
