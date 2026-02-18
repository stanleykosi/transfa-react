import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { useListTransferLists } from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';

const stripUsernamePrefix = (username: string) => normalizeUsername(username);

const TransferListsScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const { data, isLoading, refetch, isRefetching } = useListTransferLists({ limit: 50, offset: 0 });

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

        <Text style={styles.title}>List</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={BRAND_YELLOW}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
            </View>
          ) : (data ?? []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No list yet</Text>
              <Text style={styles.emptyText}>Create a list to send to multiple users faster.</Text>
            </View>
          ) : (
            (data ?? []).map((item) => {
              const preview = item.member_usernames
                .slice(0, 3)
                .map((name) => stripUsernamePrefix(name))
                .join(', ');

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.listCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('TransferListDetail', { listId: item.id })}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.iconSquare}>
                      <Text style={styles.iconText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                    </View>

                    <View style={styles.textWrap}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {preview || `${item.member_count} members`}
                      </Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#A3A4A9" />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <TouchableOpacity
          style={styles.createButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('TransferListCreate')}
        >
          <Ionicons name="add" size={18} color="#D9D9D9" />
          <Text style={styles.createButtonText}>Create new list</Text>
        </TouchableOpacity>
      </SafeAreaView>
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
    paddingHorizontal: 20,
  },
  backButton: {
    width: 28,
    marginTop: 4,
    marginBottom: 16,
  },
  title: {
    color: '#ECEDEF',
    fontSize: 25,
    fontWeight: '700',
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 22,
    gap: 12,
  },
  loadingWrap: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 24,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    color: '#ECEDEF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 6,
    color: '#A0A2A8',
    fontSize: 13,
  },
  listCard: {
    borderRadius: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  iconSquare: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4DDB5',
  },
  iconText: {
    color: '#141415',
    fontSize: 14,
    fontWeight: '800',
  },
  textWrap: {
    flex: 1,
  },
  cardTitle: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '700',
  },
  cardSub: {
    marginTop: 2,
    color: '#989AA0',
    fontSize: 13,
  },
  createButton: {
    marginTop: 8,
    marginBottom: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createButtonText: {
    color: '#D9D9D9',
    fontSize: 20,
    fontWeight: '600',
  },
});

export default TransferListsScreen;
