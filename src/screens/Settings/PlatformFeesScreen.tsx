/**
 * @description
 * Displays platform fee status and invoice history.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';
import { useNavigation } from '@react-navigation/native';
import { usePlatformFeeInvoices, usePlatformFeeStatus } from '@/api/platformFeeApi';
import { formatCurrency } from '@/utils/formatCurrency';

const PlatformFeesScreen = () => {
  const navigation = useNavigation();
  const { data: status, isLoading: isLoadingStatus } = usePlatformFeeStatus();
  const { data: invoices, isLoading: isLoadingInvoices } = usePlatformFeeInvoices();

  const isDelinquent = status?.is_delinquent || false;

  const formatDate = (value?: string) => {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Platform Fees</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Current Status</Text>
            <View
              style={[
                styles.statusBadge,
                isDelinquent ? styles.statusBadgeError : styles.statusBadgeSuccess,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isDelinquent ? styles.statusBadgeTextError : styles.statusBadgeTextSuccess,
                ]}
              >
                {isDelinquent ? 'Delinquent' : 'Active'}
              </Text>
            </View>
          </View>

          {isDelinquent && (
            <View style={styles.alertRow}>
              <Ionicons name="alert-circle" size={18} color={theme.colors.error} />
              <Text style={styles.alertText}>
                External transfers are disabled until your platform fee is settled.
              </Text>
            </View>
          )}

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue}>
                {status?.amount ? formatCurrency(status.amount) : '—'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Due Date</Text>
              <Text style={styles.summaryValue}>{formatDate(status?.due_at)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Grace Ends</Text>
              <Text style={styles.summaryValue}>{formatDate(status?.grace_until)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Status</Text>
              <Text style={styles.summaryValue}>{status?.status || '—'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Invoice History</Text>
          {(isLoadingStatus || isLoadingInvoices) && (
            <Text style={styles.sectionSubtitle}>Refreshing…</Text>
          )}
        </View>

        <View style={styles.invoiceList}>
          {(invoices || []).map((invoice) => (
            <View key={invoice.id} style={styles.invoiceCard}>
              <View style={styles.invoiceTopRow}>
                <View>
                  <Text style={styles.invoicePeriod}>
                    {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                  </Text>
                  <Text style={styles.invoiceStatus}>{invoice.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
              </View>
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Due</Text>
                <Text style={styles.invoiceMetaValue}>{formatDate(invoice.due_at)}</Text>
                <Text style={styles.invoiceMetaLabel}>Retries</Text>
                <Text style={styles.invoiceMetaValue}>{invoice.retry_count}</Text>
              </View>
            </View>
          ))}
          {(!invoices || invoices.length === 0) && !isLoadingInvoices && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={36} color={theme.colors.textSecondary} />
              <Text style={styles.emptyTitle}>No invoices yet</Text>
              <Text style={styles.emptyText}>
                Your first platform fee invoice will appear after month end.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.s24,
  },
  backButton: {
    padding: theme.spacing.s4,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  container: {
    paddingBottom: theme.spacing.s24,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s12,
  },
  summaryTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.s10,
    paddingVertical: theme.spacing.s4,
    borderRadius: theme.radii.full,
  },
  statusBadgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeError: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.semibold,
  },
  statusBadgeTextSuccess: {
    color: theme.colors.success,
  },
  statusBadgeTextError: {
    color: theme.colors.error,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s8,
    marginBottom: theme.spacing.s12,
  },
  alertText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.s12,
  },
  summaryItem: {
    width: '48%',
  },
  summaryLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s4,
  },
  summaryValue: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
  },
  sectionHeader: {
    marginTop: theme.spacing.s24,
    marginBottom: theme.spacing.s12,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
  },
  invoiceList: {
    gap: theme.spacing.s12,
  },
  invoiceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  invoiceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s8,
  },
  invoicePeriod: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  invoiceStatus: {
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s4,
  },
  invoiceAmount: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  invoiceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s8,
  },
  invoiceMetaLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  invoiceMetaValue: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.s8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.s24,
  },
  emptyTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s8,
  },
  emptyText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s4,
  },
});

export default PlatformFeesScreen;
