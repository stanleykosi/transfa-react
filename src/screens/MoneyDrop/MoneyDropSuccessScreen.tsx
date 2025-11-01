/**
 * @description
 * This screen is displayed after a user successfully creates a Money Drop.
 * It shows a confirmation message, the details of the drop including fees,
 * a shareable QR code, and a copyable link. Enhanced with better visual design
 * and fee transparency.
 *
 * @dependencies
 * - react, react-native: For UI components.
 * - @react-navigation/native: For route parameters and navigation.
 * - react-native-qrcode-svg: For rendering the QR code.
 * - @expo/vector-icons: For icons.
 * - @/components/*: Reusable UI components.
 * - @/utils/formatCurrency: For displaying currency values.
 * - Share API: For sharing the link.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Share,
  Pressable,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import Card from '@/components/Card';
import AppHeader from '@/components/AppHeader';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList } from '@/navigation/AppStack';
import { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
// Clipboard functionality - using React Native's built-in Clipboard or fallback

type MoneyDropSuccessScreenRouteProp = RouteProp<AppStackParamList, 'MoneyDropSuccess'>;

const MoneyDropSuccessScreen = () => {
  const route = useRoute<MoneyDropSuccessScreenRouteProp>();
  const navigation = useNavigation<AppNavigationProp>();
  const { dropDetails } = route.params;
  const [linkCopied, setLinkCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      // Use Share API as fallback for copying
      await Share.share({
        message: dropDetails.shareable_link,
        title: 'Money Drop Link',
      });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error: any) {
      Alert.alert('Copy Error', error.message || 'Failed to copy link');
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({
        message: `Claim your money drop: ${dropDetails.shareable_link}`,
        url: dropDetails.shareable_link,
        title: 'Transfa Money Drop',
      });
    } catch (error: any) {
      Alert.alert('Share Error', error.message || 'Failed to share link');
    }
  };

  return (
    <ScreenWrapper>
      <AppHeader title="Money Drop Created" icon="checkmark-circle" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="gift" size={48} color={theme.colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>Money Drop Created Successfully!</Text>
        <Text style={styles.subtitle}>
          Share the QR code or link below for others to claim their portion. Funds are securely
          stored in a dedicated account until claimed or refunded.
        </Text>

        {/* QR Code Card */}
        <Card style={styles.qrCard}>
          <View style={styles.qrContainer}>
            <QRCode value={dropDetails.qr_code_content} size={220} />
          </View>
          <Text style={styles.qrHint}>Scan to claim</Text>
        </Card>

        {/* Details Card */}
        <Card style={styles.detailsCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle" size={24} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Drop Details</Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailLabelContainer}>
              <Ionicons name="cash" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.detailLabel}>Total Amount</Text>
            </View>
            <Text style={styles.detailValue}>{formatCurrency(dropDetails.total_amount)}</Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailLabelContainer}>
              <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.detailLabel}>Amount per Person</Text>
            </View>
            <Text style={styles.detailValue}>{formatCurrency(dropDetails.amount_per_claim)}</Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailLabelContainer}>
              <Ionicons name="people" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.detailLabel}>Number of People</Text>
            </View>
            <Text style={styles.detailValue}>{dropDetails.number_of_people}</Text>
          </View>

          {dropDetails.fee > 0 && (
            <View style={styles.detailRow}>
              <View style={styles.detailLabelContainer}>
                <Ionicons name="card" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.detailLabel}>Creation Fee</Text>
              </View>
              <Text style={styles.detailFee}>{formatCurrency(dropDetails.fee)}</Text>
            </View>
          )}

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelContainer}>
              <Ionicons name="time" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.detailLabel}>Expires</Text>
            </View>
            <Text style={styles.detailValue}>
              {new Date(dropDetails.expiry_timestamp).toLocaleString()}
            </Text>
          </View>
        </Card>

        {/* Share Link Card */}
        <Card style={styles.linkCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="link" size={24} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Shareable Link</Text>
          </View>
          <TouchableOpacity
            style={styles.linkContainer}
            onPress={copyToClipboard}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText} numberOfLines={1}>
              {dropDetails.shareable_link}
            </Text>
            <Ionicons
              name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
              size={24}
              color={linkCopied ? theme.colors.success : theme.colors.primary}
            />
          </TouchableOpacity>
          <Pressable onPress={shareLink} style={styles.shareButton}>
            <Ionicons name="share-social-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.shareButtonText}>Share Link</Text>
          </Pressable>
        </Card>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark" size={20} color={theme.colors.success} />
          <Text style={styles.securityText}>
            Funds are stored securely in a dedicated account. Unclaimed funds will be automatically
            refunded to your wallet after expiry.
          </Text>
        </View>

        <PrimaryButton
          title="Done"
          onPress={() => navigation.navigate('Home' as never)}
          style={styles.doneButton}
        />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.s24,
    paddingBottom: theme.spacing.s48,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.s24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.s8,
  },
  subtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.s32,
    lineHeight: 20,
  },
  qrCard: {
    padding: theme.spacing.s24,
    alignItems: 'center',
    marginBottom: theme.spacing.s24,
  },
  qrContainer: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.s12,
  },
  qrHint: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
  },
  detailsCard: {
    width: '100%',
    padding: theme.spacing.s20,
    marginBottom: theme.spacing.s24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
  },
  cardTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.s8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.s12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.s8,
  },
  detailValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.semibold,
  },
  detailFee: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  detailDivider: {
    height: 2,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.s8,
  },
  linkCard: {
    width: '100%',
    padding: theme.spacing.s20,
    marginBottom: theme.spacing.s24,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.s12,
  },
  linkText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.primary,
    marginRight: theme.spacing.s8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.s12,
  },
  shareButtonText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
    marginLeft: theme.spacing.s8,
  },
  securityNote: {
    flexDirection: 'row',
    backgroundColor: theme.colors.success + '15',
    borderRadius: theme.radii.md,
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s24,
    alignItems: 'flex-start',
  },
  securityText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.s12,
    lineHeight: 18,
  },
  doneButton: {
    width: '100%',
  },
});

export default MoneyDropSuccessScreen;
