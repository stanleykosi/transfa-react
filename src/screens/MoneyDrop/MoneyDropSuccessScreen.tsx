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
import * as Clipboard from 'expo-clipboard';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import Card from '@/components/Card';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList } from '@/navigation/AppStack';
import { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';

type MoneyDropSuccessScreenRouteProp = RouteProp<AppStackParamList, 'MoneyDropSuccess'>;

const MoneyDropSuccessScreen = () => {
  const route = useRoute<MoneyDropSuccessScreenRouteProp>();
  const navigation = useNavigation<AppNavigationProp>();
  const { dropDetails } = route.params;
  const [linkCopied, setLinkCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await Clipboard.setStringAsync(dropDetails.shareable_link);
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
      <ScrollView
        contentContainerStyle={styles.contentWrapper}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={64} color={theme.colors.success} />
          </View>
        </View>

        <Text style={styles.successTitle}>Money Drop Created Successfully!</Text>

        {/* Details Card */}
        <Card style={styles.detailsCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Drop Details</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Amount</Text>
            <Text style={styles.detailValue}>{formatCurrency(dropDetails.total_amount)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount per Person</Text>
            <Text style={styles.detailValue}>{formatCurrency(dropDetails.amount_per_claim)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Number of People</Text>
            <Text style={styles.detailValue}>{dropDetails.number_of_people}</Text>
          </View>

          {dropDetails.fee > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Creation Fee</Text>
              <Text style={styles.detailFee}>{formatCurrency(dropDetails.fee)}</Text>
            </View>
          )}

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>
              {new Date(dropDetails.expiry_timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </Card>

        {/* QR Code Card */}
        <Card style={styles.qrCard}>
          <View style={styles.qrContainer}>
            <QRCode value={dropDetails.qr_code_content} size={180} />
          </View>
          <Text style={styles.qrHint}>Scan QR code to claim</Text>
        </Card>

        {/* Share Link Card */}
        <Card style={styles.linkCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="link" size={20} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Shareable Link</Text>
          </View>
          <TouchableOpacity
            style={styles.linkContainer}
            onPress={copyToClipboard}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
              {dropDetails.shareable_link}
            </Text>
            <Ionicons
              name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
              size={20}
              color={linkCopied ? theme.colors.success : theme.colors.primary}
            />
          </TouchableOpacity>
          <Pressable onPress={shareLink} style={styles.shareButton}>
            <Ionicons name="share-social-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.shareButtonText}>Share Link</Text>
          </Pressable>
        </Card>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark" size={18} color={theme.colors.success} />
          <Text style={styles.securityText}>
            Funds are stored securely in a dedicated account. Unclaimed funds will be automatically
            refunded after expiry.
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
  contentWrapper: {
    paddingTop: theme.spacing.s16,
    paddingBottom: theme.spacing.s32,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.s16,
    marginBottom: theme.spacing.s24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.s24,
  },
  qrCard: {
    padding: theme.spacing.s20,
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
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
  },
  detailsCard: {
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
  },
  cardTitle: {
    fontSize: theme.fontSizes.base,
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
  detailLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
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
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.s8,
  },
  linkCard: {
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s16,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s12,
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
    paddingVertical: theme.spacing.s8,
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
    padding: theme.spacing.s12,
    marginBottom: theme.spacing.s24,
    alignItems: 'flex-start',
  },
  securityText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.s8,
    lineHeight: 18,
  },
  doneButton: {
    marginTop: theme.spacing.s8,
  },
});

export default MoneyDropSuccessScreen;
