/**
 * @description
 * A reusable wrapper component for all screens in the application.
 * It provides a consistent layout by handling safe area insets and applying the
 * standard background color from the theme.
 *
 * @dependencies
 * - react-native-safe-area-context: Used to properly handle screen areas that might be
 *   obstructed by system UI, like notches and status bars.
 * - @/constants/theme: Provides the default background color.
 *
 * @props
 * - children (React.ReactNode): The content to be rendered within the safe area.
 * - style (StyleProp<ViewStyle>): Optional custom styles to be applied to the container view.
 *
 * @example
 * <ScreenWrapper>
 *   <Text>Your screen content here</Text>
 * </ScreenWrapper>
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ children, style }) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.s20,
    paddingTop: theme.spacing.s20,
    paddingBottom: 0,
  },
});

export default ScreenWrapper;
