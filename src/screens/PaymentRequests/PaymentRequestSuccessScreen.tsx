/**
 * @description
 * This screen is displayed after a payment request is successfully created.
 * It shows the user a confirmation message, a scannable QR code, and a
 * shareable link for the payment request.
 *
 * @dependencies
 * - react, react-native: For UI components and hooks.
 * - @react-navigation/native: For route params and navigation.
 * - @/components/*: Reusable UI components.
 * - react-native-qrcode-svg: For generating the QR code.
 * - @expo/vector-icons: For icons.
 */
import React from 'react';
import { View, Text, StyleSheet, Share, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '@/navigation/AppStack';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

type ScreenRouteProp = RouteProp<AppStackParamList, 'PaymentRequestSuccess'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

// Define a base URL for the shareable links. This should be in an env file in a real app.
const APP_BASE_URL = 'https://transfa.app/pay';

const PaymentRequestSuccessScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { requestId } = route.params;

  const shareableLink = `${APP_BASE_URL}?request_id=${requestId}`;

  const onShare = async () => {
    try {
      await Share.share({
        message: `Please pay me using this Transfa link: ${shareableLink}`,
        url: shareableLink,
        title: 'Transfa Payment Request',
      });
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={theme.colors.secondary} />
        </View>
        <Text style={styles.title}>Request Created!</Text>
        <Text style={styles.subtitle}>
          Share the QR code or link below with anyone to receive your payment.
        </Text>

        <View style={styles.qrContainer}>
          <QRCode
            value={shareableLink}
            size={220}
            logoBackgroundColor="transparent"
            backgroundColor={theme.colors.surface}
            color={theme.colors.textPrimary}
          />
        </View>

        <View style={styles.linkContainer}>
          <Text style={styles.linkText} numberOfLines={1}>
            {shareableLink}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <PrimaryButton title="Share Link" onPress={onShare} />
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.navigate('AppTabs', { screen: 'Payments' })}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s24,
  },
  iconContainer: {
    marginBottom: theme.spacing.s24,
  },
  title: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s12,
    marginBottom: theme.spacing.s32,
  },
  qrContainer: {
    padding: theme.spacing.s16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    marginBottom: theme.spacing.s32,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linkContainer: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linkText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    marginTop: theme.spacing.s40,
  },
  doneButton: {
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s12,
  },
  doneButtonText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.primary,
    textAlign: 'center',
    fontWeight: theme.fontWeights.semibold,
  },
});

export default PaymentRequestSuccessScreen;
