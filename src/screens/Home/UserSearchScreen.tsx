import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useUserSearch } from '@/api/userDiscoveryApi';
import type { UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername } from '@/utils/username';

const cleanUsername = (value: string) => normalizeUsername(value);

const UserSearchScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);

  const { data, isLoading } = useUserSearch(normalizedQuery, 20);
  const results = data?.users ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#EDEDED" />
        </TouchableOpacity>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color="#EDEDED" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users"
            placeholderTextColor="#BDBDBE"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

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
              <UserResultCard
                key={user.id}
                user={user}
                onPress={() => navigation.navigate('UserProfileView', { user })}
              />
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const UserResultCard = ({ user, onPress }: { user: UserDiscoveryResult; onPress: () => void }) => {
  const initials =
    user.full_name?.slice(0, 1)?.toUpperCase() ||
    cleanUsername(user.username).slice(0, 1).toUpperCase();

  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.resultCard} onPress={onPress}>
      <View style={styles.resultAvatar}>
        <Text style={styles.resultAvatarInitial}>{initials}</Text>
      </View>

      <View style={styles.resultTextWrap}>
        <Text style={styles.resultUsername}>{cleanUsername(user.username)}</Text>
        <Text style={styles.resultFullName} numberOfLines={1}>
          {user.full_name || 'Transfa User'}
        </Text>
      </View>

      <View style={styles.badgeWrap}>
        <Ionicons name="lock-closed" size={10} color="#0A0A0A" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050607',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  backButton: {
    paddingVertical: 6,
    width: 30,
    marginBottom: 14,
  },
  searchWrap: {
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ECECEC',
    fontSize: 14,
    paddingVertical: 0,
  },
  helperText: {
    marginTop: 20,
    color: '#9C9EA1',
    fontSize: 14,
  },
  centerState: {
    marginTop: 28,
    alignItems: 'center',
  },
  resultsList: {
    marginTop: 14,
    gap: 12,
  },
  resultCard: {
    minHeight: 64,
    backgroundColor: '#F6F6F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarInitial: {
    color: '#141516',
    fontWeight: '700',
    fontSize: 15,
  },
  resultTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  resultUsername: {
    color: '#141516',
    fontWeight: '700',
    fontSize: 20,
  },
  resultFullName: {
    marginTop: 2,
    color: '#535456',
    fontSize: 13,
  },
  badgeWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default UserSearchScreen;
