import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import BackIcon from '@/assets/icons/back.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

const individualSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12.1596 11.62C12.1296 11.62 12.1096 11.62 12.0796 11.62C12.0296 11.61 11.9596 11.61 11.8996 11.62C8.99963 11.53 6.80963 9.25 6.80963 6.44C6.80963 3.58 9.13963 1.25 11.9996 1.25C14.8596 1.25 17.1896 3.58 17.1896 6.44C17.1796 9.25 14.9796 11.53 12.1896 11.62C12.1796 11.62 12.1696 11.62 12.1596 11.62ZM11.9996 2.75C9.96963 2.75 8.30963 4.41 8.30963 6.44C8.30963 8.44 9.86963 10.05 11.8596 10.12C11.9096 10.11 12.0496 10.11 12.1796 10.12C14.1396 10.03 15.6796 8.42 15.6896 6.44C15.6896 4.41 14.0296 2.75 11.9996 2.75Z" fill="white"/>
<path d="M12.1696 22.55C10.2096 22.55 8.23961 22.05 6.74961 21.05C5.35961 20.13 4.59961 18.87 4.59961 17.5C4.59961 16.13 5.35961 14.86 6.74961 13.93C9.74961 11.94 14.6096 11.94 17.5896 13.93C18.9696 14.85 19.7396 16.11 19.7396 17.48C19.7396 18.85 18.9796 20.12 17.5896 21.05C16.0896 22.05 14.1296 22.55 12.1696 22.55ZM7.57961 15.19C6.61961 15.83 6.09961 16.65 6.09961 17.51C6.09961 18.36 6.62961 19.18 7.57961 19.81C10.0696 21.48 14.2696 21.48 16.7596 19.81C17.7196 19.17 18.2396 18.35 18.2396 17.49C18.2396 16.64 17.7096 15.82 16.7596 15.19C14.2696 13.53 10.0696 13.53 7.57961 15.19Z" fill="white"/>
</svg>`;

const merchantSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14.7 22.75H9.30001C4.36001 22.75 2.26001 20.64 2.26001 15.71V11.22C2.26001 10.81 2.60001 10.47 3.01001 10.47C3.42001 10.47 3.76001 10.81 3.76001 11.22V15.71C3.76001 19.8 5.21001 21.25 9.30001 21.25H14.69C18.78 21.25 20.23 19.8 20.23 15.71V11.22C20.23 10.81 20.57 10.47 20.98 10.47C21.39 10.47 21.73 10.81 21.73 11.22V15.71C21.74 20.64 19.63 22.75 14.7 22.75Z" fill="white"/>
<path d="M12 12.75C10.9 12.75 9.9 12.32 9.19 11.53C8.48 10.74 8.15 9.71 8.26 8.61L8.93 1.93C8.97 1.55 9.29 1.25 9.68 1.25H14.35C14.74 1.25 15.06 1.54 15.1 1.93L15.77 8.61C15.88 9.71 15.55 10.74 14.84 11.53C14.1 12.32 13.1 12.75 12 12.75ZM10.35 2.75L9.75 8.76C9.68 9.43 9.88 10.06 10.3 10.52C11.15 11.46 12.85 11.46 13.7 10.52C14.12 10.05 14.32 9.42 14.25 8.76L13.65 2.75H10.35Z" fill="white"/>
<path d="M18.31 12.75C16.28 12.75 14.47 11.11 14.26 9.09L13.56 2.08C13.54 1.87 13.61 1.66 13.75 1.5C13.89 1.34 14.09 1.25 14.31 1.25H17.36C20.3 1.25 21.67 2.48 22.08 5.5L22.36 8.28C22.48 9.46 22.12 10.58 21.35 11.43C20.58 12.28 19.5 12.75 18.31 12.75ZM15.14 2.75L15.76 8.94C15.89 10.19 17.05 11.25 18.31 11.25C19.07 11.25 19.75 10.96 20.24 10.43C20.72 9.9 20.94 9.19 20.87 8.43L20.59 5.68C20.28 3.42 19.55 2.75 17.36 2.75H15.14Z" fill="white"/>
<path d="M5.64002 12.75C4.45002 12.75 3.37002 12.28 2.60002 11.43C1.83002 10.58 1.47002 9.46 1.59002 8.28L1.86002 5.53C2.28002 2.48 3.65002 1.25 6.59002 1.25H9.64002C9.85002 1.25 10.05 1.34 10.2 1.5C10.35 1.66 10.41 1.87 10.39 2.08L9.69002 9.09C9.48002 11.11 7.67002 12.75 5.64002 12.75ZM6.59002 2.75C4.40002 2.75 3.67002 3.41 3.35002 5.7L3.08002 8.43C3.00002 9.19 3.23002 9.9 3.71002 10.43C4.19002 10.96 4.87002 11.25 5.64002 11.25C6.90002 11.25 8.07002 10.19 8.19002 8.94L8.81002 2.75H6.59002Z" fill="white"/>
<path d="M14.5 22.75H9.5C9.09 22.75 8.75 22.41 8.75 22V19.5C8.75 17.4 9.9 16.25 12 16.25C14.1 16.25 15.25 17.4 15.25 19.5V22C15.25 22.41 14.91 22.75 14.5 22.75ZM10.25 21.25H13.75V19.5C13.75 18.24 13.26 17.75 12 17.75C10.74 17.75 10.25 18.24 10.25 19.5V21.25Z" fill="white"/>
</svg>`;

interface AuthAccountTypeProps {
  onSelectIndividual: () => void;
  onSelectMerchant: () => void;
  onBack?: () => void;
}

export default function AuthAccountType({
  onSelectIndividual,
  onSelectMerchant,
  onBack,
}: AuthAccountTypeProps) {
  const insets = useSafeAreaInsets();

  const handleSelectIndividual = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectIndividual();
  }, [onSelectIndividual]);

  const handleSelectMerchant = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectMerchant();
  }, [onSelectMerchant]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  }, [onBack]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + verticalScale(20),
            paddingBottom: insets.bottom + verticalScale(20),
          },
        ]}
      >
        {/* Back Button */}
        {onBack && (
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressedOpacity]}
            onPress={handleBack}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <SvgAsset source={BackIcon} width={scale(24)} height={scale(24)} />
          </Pressable>
        )}

        {/* Logo */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
          <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
        </Animated.View>

        {/* Title and Subtitle */}
        <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Select account type</Text>
        </Animated.View>

        {/* Account Type Selection Cards */}
        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.cardsContainer}>
          {/* Individual Card */}
          <View style={styles.cardWrapper}>
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={handleSelectIndividual}
            >
              <View style={styles.iconContainer}>
                <SvgXml xml={individualSvg} width={scale(24)} height={scale(24)} />
              </View>
              <Text style={styles.cardTitle}>Individual</Text>
            </Pressable>
            <Text style={styles.cardDescription}>For Individual use</Text>
          </View>

          {/* Merchant Card */}
          <View style={styles.cardWrapper}>
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={handleSelectMerchant}
            >
              <View style={styles.iconContainer}>
                <SvgXml xml={merchantSvg} width={scale(24)} height={scale(24)} />
              </View>
              <Text style={styles.cardTitle}>Merchant</Text>
            </Pressable>
            <Text style={styles.cardDescription}>For Business owners</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: scale(20),
    zIndex: 1,
  },
  backButton: {
    marginBottom: verticalScale(40),
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(60),
  },
  title: {
    fontSize: moderateScale(36),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: verticalScale(8),
    fontFamily: 'ArtificTrial-Semibold',
  },
  subtitle: {
    maxWidth: scale(260),
    fontSize: moderateScale(20),
    textAlign: 'center',
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: scale(16),
  },
  cardWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#333333',
    borderRadius: scale(15),
    borderCurve: 'continuous',
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconContainer: {
    marginBottom: verticalScale(16),
  },
  cardTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  cardDescription: {
    maxWidth: scale(100),
    fontSize: moderateScale(16),
    color: '#6C6B6B',
    textAlign: 'center',
    marginTop: verticalScale(12),
    fontFamily: 'Montserrat_400Regular',
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});
