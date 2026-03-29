import AnimatedPageWrapper from '@/components/AnimatedPageWrapper';
import BottomNavbar from '@/components/bottom-navbar';
import type { AppStackParamList } from '@/navigation/AppStack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

type AppNavigationProp = NativeStackNavigationProp<AppStackParamList>;
type NavTab = 'home' | 'settings' | 'gifts' | 'support';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    id: '1',
    question: 'How do I send money?',
    answer:
      "Tap the Send button on the home screen, enter the recipient's username or scan their QR code, enter the amount, and confirm.",
  },
  {
    id: '2',
    question: 'What are MoneyDrops?',
    answer:
      'MoneyDrops let you create cash giveaways for your contacts. Set an amount, choose how many people can claim it, and share the drop link.',
  },
  {
    id: '3',
    question: 'How do I receive money?',
    answer:
      'Share your QR code or username with the sender. They can scan your code or search for your username to send you money.',
  },
  {
    id: '4',
    question: 'Is my money safe?',
    answer:
      'Yes! We use bank-level encryption and two-factor authentication to protect your account and transactions.',
  },
  {
    id: '5',
    question: 'How do I reset my PIN?',
    answer:
      "Go to Settings > Security > Change PIN. You'll need to verify your identity before setting a new PIN.",
  },
];

const supportOptions = [
  { id: '1', label: 'Live Chat', icon: '💬', subtitle: 'Chat with our team' },
  { id: '2', label: 'Email Us', icon: '✉️', subtitle: 'support@transfa.com' },
  { id: '3', label: 'Call Us', icon: '📞', subtitle: '+234 800 123 4567' },
  { id: '4', label: 'Report Issue', icon: '🚨', subtitle: 'Report a bug or problem' },
];

const SupportScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();

  const handleTabPress = (tab: NavTab) => {
    if (tab === 'home') {
      navigation.navigate('AppTabs', { screen: 'Home' });
      return;
    }

    if (tab === 'settings') {
      navigation.navigate('AppTabs', { screen: 'Settings', params: { screen: 'ProfileHome' } });
      return;
    }

    if (tab === 'gifts') {
      navigation.navigate('AppTabs', { screen: 'MoneyDrop' });
      return;
    }

    navigation.navigate('AppTabs', { screen: 'Support' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.backgroundContainer} pointerEvents="none">
        <SvgXml
          xml={backgroundSvg}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          pointerEvents="none"
        />
      </View>

      <AnimatedPageWrapper>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>SUPPORT</Text>

          <Text style={styles.subtitle}>How can we help you?</Text>

          <View style={styles.optionsGrid}>
            {supportOptions.map((option) => (
              <TouchableOpacity key={option.id} style={styles.optionCard} activeOpacity={0.7}>
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.faqSection}>
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
            {faqItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.faqCard} activeOpacity={0.7}>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Text style={styles.faqAnswer} numberOfLines={2}>
                  {item.answer}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </AnimatedPageWrapper>

      <BottomNavbar activeTab="support" onTabPress={handleTabPress} visible />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  subtitle: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginBottom: 32,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 40,
  },
  optionCard: {
    width: (SCREEN_WIDTH - 52) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    gap: 6,
  },
  optionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  optionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  optionSubtitle: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
  },
  faqSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
  },
  faqCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    gap: 6,
  },
  faqQuestion: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Montserrat_600SemiBold',
  },
  faqAnswer: {
    color: '#6C6B6B',
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    lineHeight: 18,
  },
});

export default SupportScreen;
