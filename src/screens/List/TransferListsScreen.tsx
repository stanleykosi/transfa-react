import AddIcon from '@/assets/icons/add.svg';
import ArrowRightIcon from '@/assets/icons/arrow-right1.svg';
import BackIcon from '@/assets/icons/back.svg';
import { useListTransferLists } from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername } from '@/utils/username';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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

const LIST_EMOJIS = ['👩🏼‍🤝‍👨🏾', '💪', '🛒', '👶', '📚', '🎯', '🍽️', '🎉', '📦', '🚕'];

const emojiFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return LIST_EMOJIS[Math.abs(hash) % LIST_EMOJIS.length] || '📋';
};

const stripUsernamePrefix = (username: string) => normalizeUsername(username);

const TransferListsScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const { data, isLoading, refetch, isRefetching } = useListTransferLists({ limit: 50, offset: 0 });

  const lists = useMemo(() => data ?? [], [data]);

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
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FFD300" />
        }
      >
        <View style={styles.titleContainer}>
          <Text style={styles.title}>List</Text>
        </View>

        <View style={styles.listsSection}>
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#FFD300" />
            </View>
          ) : lists.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No list yet</Text>
              <Text style={styles.emptyText}>Create a list to send to multiple users faster.</Text>
            </View>
          ) : (
            lists.map((list) => {
              const subtitle = list.member_usernames
                .slice(0, 3)
                .map((username) => stripUsernamePrefix(username))
                .join(', ');

              return (
                <TouchableOpacity
                  key={list.id}
                  style={styles.listCard}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('TransferListDetail', { listId: list.id })}
                >
                  <View style={styles.listIconContainer}>
                    <Text style={styles.emojiText}>{emojiFromSeed(list.id || list.name)}</Text>
                  </View>

                  <View style={styles.listTextContainer}>
                    <Text style={styles.listTitle} numberOfLines={1}>
                      {list.name}
                    </Text>
                    <Text style={styles.listSubtitle} numberOfLines={1}>
                      {subtitle || `${list.member_count} members`}
                    </Text>
                  </View>

                  <ArrowRightIcon width={20} height={20} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.createButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('TransferListCreate')}
        >
          <AddIcon width={20} height={20} color="#6C6B6B" />
          <Text style={styles.createButtonText}>Create new list</Text>
        </TouchableOpacity>
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
  titleContainer: {
    marginBottom: 32,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  listsSection: {
    gap: 12,
    marginBottom: 24,
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#C2C2C2',
    fontFamily: 'Montserrat_400Regular',
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  listIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  emojiText: {
    fontSize: 18,
  },
  listTextContainer: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  listSubtitle: {
    fontSize: 14,
    color: '#9A9A9A',
    fontFamily: 'Montserrat_400Regular',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    paddingVertical: 14,
    marginTop: 8,
  },
  createButtonText: {
    fontSize: 20,
    color: '#D9D9D9',
    fontFamily: 'Montserrat_600SemiBold',
  },
});

export default TransferListsScreen;
