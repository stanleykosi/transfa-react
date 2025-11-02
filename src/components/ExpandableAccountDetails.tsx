/**
 * @description
 * Expandable account details component that shows/hides NUBAN and bank name
 * with smooth accordion animation. Features copy to clipboard functionality
 * with haptic feedback.
 *
 * @dependencies
 * - react-native-reanimated: For accordion animation
 * - expo-haptics: For haptic feedback
 * - expo-clipboard: For copy functionality
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/constants/theme';

interface ExpandableAccountDetailsProps {
  accountNumber: string;
  bankName: string;
}

const ExpandableAccountDetails: React.FC<ExpandableAccountDetailsProps> = ({
  accountNumber,
  bankName,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);

  const toggleExpand = () => {
    const newExpandedState = !isExpanded;

    if (newExpandedState) {
      // Expanding
      height.value = withTiming(140, {
        duration: 350,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      opacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.ease,
      });
      rotation.value = withTiming(180, {
        duration: 350,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Collapsing
      height.value = withTiming(0, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      opacity.value = withTiming(0, {
        duration: 250,
        easing: Easing.ease,
      });
      rotation.value = withTiming(0, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsExpanded(newExpandedState);
  };

  const copyToClipboard = async () => {
    try {
      await Clipboard.setStringAsync(accountNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied!', 'Account number copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.container}>
      {/* Add Money Button */}
      <TouchableOpacity style={styles.addMoneyButton} onPress={toggleExpand} activeOpacity={0.8}>
        <View style={styles.buttonContent}>
          <Ionicons name="wallet" size={20} color={theme.colors.textOnPrimary} />
          <Text style={styles.addMoneyText}>Add Money</Text>
          <Animated.View style={animatedIconStyle}>
            <Ionicons name="chevron-down" size={20} color={theme.colors.textOnPrimary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expandable Account Details */}
      <Animated.View style={[styles.detailsContainer, animatedContainerStyle]}>
        <View style={styles.detailsContent}>
          <View style={styles.detailRow}>
            <Ionicons name="card-outline" size={18} color={theme.colors.textOnPrimary} />
            <Text style={styles.detailText}>{accountNumber}</Text>
          </View>

          {bankName && (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={18} color={theme.colors.textOnPrimary} />
              <Text style={styles.detailText}>{bankName}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={16} color={theme.colors.textOnPrimary} />
            <Text style={styles.copyButtonText}>Copy Account Number</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.s16,
  },
  addMoneyButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.radii.full,
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s20,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s8,
  },
  addMoneyText: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textOnPrimary,
  },
  detailsContainer: {
    overflow: 'hidden',
    marginTop: theme.spacing.s12,
  },
  detailsContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    paddingBottom: theme.spacing.s20,
    gap: theme.spacing.s12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s12,
  },
  detailText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textOnPrimary,
    opacity: 0.95,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.s8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s16,
    borderRadius: theme.radii.md,
    marginTop: theme.spacing.s8,
  },
  copyButtonText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textOnPrimary,
  },
});

export default ExpandableAccountDetails;
