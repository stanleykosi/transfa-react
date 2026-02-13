import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchAccountTypeOptions } from '@/api/authApi';
import { AccountTypeOption } from '@/types/api';
import { AppStackParamList } from '@/navigation/AppStack';

type AppNavigation = NativeStackNavigationProp<AppStackParamList, 'SelectAccountType'>;

const fallbackOptions: AccountTypeOption[] = [
  {
    type: 'personal',
    title: 'Individual',
    description: 'For Individual use',
  },
  {
    type: 'merchant',
    title: 'Merchant',
    description: 'For Business owners',
  },
];

const iconByType: Record<AccountTypeOption['type'], React.ComponentProps<typeof Ionicons>['name']> =
  {
    personal: 'person-outline',
    merchant: 'storefront-outline',
  };

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const SelectAccountTypeScreen = () => {
  const navigation = useNavigation<AppNavigation>();
  const [isLoading, setIsLoading] = useState(true);
  const [options, setOptions] = useState<AccountTypeOption[]>(fallbackOptions);

  useEffect(() => {
    let mounted = true;

    const loadOptions = async () => {
      try {
        const response = await fetchAccountTypeOptions();
        if (!mounted) {
          return;
        }

        if (Array.isArray(response.options) && response.options.length > 0) {
          setOptions(
            response.options.filter(
              (option): option is AccountTypeOption =>
                option?.type === 'personal' || option?.type === 'merchant'
            )
          );
        }
      } catch (error) {
        console.warn('Failed to load account type options. Using defaults.', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      mounted = false;
    };
  }, []);

  const hasValidOptions = useMemo(() => options.length > 0, [options]);

  const handleSelectType = (selectedType: AccountTypeOption['type']) => {
    navigation.navigate('OnboardingForm', { userType: selectedType });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.content}>
            <TransfaMark />
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Select account type</Text>

            {isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#FFD300" />
              </View>
            ) : (
              <View style={styles.optionsRow}>
                {(hasValidOptions ? options : fallbackOptions).map((option) => (
                  <View key={option.type} style={styles.optionWrap}>
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={() => handleSelectType(option.type)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={iconByType[option.type]} size={26} color="#E6E6E6" />
                      <Text style={styles.optionTitle}>{option.title}</Text>
                    </TouchableOpacity>
                    <Text style={styles.optionCaption}>{option.description}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    marginTop: 40,
    alignItems: 'center',
  },
  logoMark: {
    width: 42,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#FFD300',
    marginBottom: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  logoSlash: {
    position: 'absolute',
    width: 60,
    height: 11,
    backgroundColor: '#0A0A0A',
    transform: [{ rotate: '-12deg' }],
    top: 4,
    right: -17,
  },
  logoBottomMark: {
    width: 8,
    height: 6,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    backgroundColor: '#0A0A0A',
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: {
    color: '#F3F3F3',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    color: '#5F5F63',
    fontSize: 31,
    fontWeight: '500',
  },
  loadingWrap: {
    marginTop: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsRow: {
    marginTop: 50,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionWrap: {
    flex: 1,
    alignItems: 'center',
  },
  optionCard: {
    width: '100%',
    minHeight: 94,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  optionTitle: {
    marginTop: 8,
    color: '#E8E8E8',
    fontSize: 14,
    fontWeight: '500',
  },
  optionCaption: {
    marginTop: 11,
    color: '#4D4D52',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SelectAccountTypeScreen;
