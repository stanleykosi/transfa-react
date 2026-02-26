import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDeleteBeneficiary, useListBeneficiaries } from '@/api/accountApi';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import type { Beneficiary } from '@/types/api';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'Beneficiaries'>;

const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const BeneficiariesScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { data, isLoading, error } = useListBeneficiaries();

  const deleteMutation = useDeleteBeneficiary({
    onError: (err) => {
      Alert.alert('Delete failed', err.message || 'Unable to remove linked account.');
    },
  });

  const remove = (beneficiary: Beneficiary) => {
    Alert.alert('Remove linked account', `Remove ${beneficiary.account_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(beneficiary.id),
      },
    ]);
  };

  const renderItem = ({ item }: { item: Beneficiary }) => (
    <View style={styles.card}>
      <View style={styles.cardTextWrap}>
        <Text style={styles.accountName}>{item.account_name}</Text>
        <Text style={styles.accountNumber}>{item.account_number_masked}</Text>
        <Text style={styles.bankName}>{item.bank_name}</Text>
      </View>
      <TouchableOpacity style={styles.trashButton} onPress={() => remove(item)}>
        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>Linked Account</Text>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#FFD400" />
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Unable to load linked accounts.</Text>
            </View>
          ) : (
            <FlatList
              data={data || []}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No linked accounts yet.</Text>
                </View>
              }
            />
          )}

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('LinkAccountPin')}
          >
            <Ionicons name="add" size={20} color="#6F7278" />
            <Text style={styles.linkButtonText}>Link New Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
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
  container: {
    flex: 1,
    paddingHorizontal: spacing.s20,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 20,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTextWrap: {
    flex: 1,
  },
  accountName: {
    color: '#EDEDEE',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  accountNumber: {
    marginTop: 4,
    color: '#A4A7AC',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  bankName: {
    marginTop: 2,
    color: '#D4D6DA',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  trashButton: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButton: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 12,
    marginBottom: 8,
  },
  linkButtonText: {
    color: '#7E8188',
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#A6A8AC',
    fontSize: fontSizes.sm,
  },
});

export default BeneficiariesScreen;
