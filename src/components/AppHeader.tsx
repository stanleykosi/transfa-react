import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onActionPress?: () => void;
  actionLabel?: string;
  showBack?: boolean;
  style?: ViewStyle;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  icon = 'swap-horizontal',
  onActionPress,
  actionLabel,
  showBack = true,
  style,
}) => {
  const navigation = useNavigation();

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, style]}>
        <View style={styles.topRow}>
          {showBack ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleBack}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          {onActionPress && actionLabel ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onActionPress}
              style={styles.actionButton}
            >
              <Text style={styles.actionLabel}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionPlaceholder} />
          )}
        </View>

        <View style={styles.iconRow}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={20} color={theme.colors.primary} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.surface,
  },
  container: {
    paddingHorizontal: theme.spacing.s20,
    paddingTop: theme.spacing.s8,
    paddingBottom: theme.spacing.s8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backPlaceholder: {
    width: 40,
    height: 40,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: theme.spacing.s4,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  actionButton: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.s12,
    paddingVertical: theme.spacing.s8,
    backgroundColor: theme.colors.primaryLight,
  },
  actionLabel: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  actionPlaceholder: {
    width: 40,
    height: 40,
  },
  iconRow: {
    marginTop: theme.spacing.s8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export default AppHeader;
