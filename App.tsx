import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, useColorScheme, View, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import FormInput from '@/components/FormInput';
import Card from '@/components/Card';
import { theme } from '@/constants/theme';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('Welcome to TransfaApp!');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonPress = () => {
    setCount(count + 1);
    setMessage(`Button pressed ${count + 1} times!`);
  };

  const showAlert = () => {
    Alert.alert('Test Alert', 'This is a test alert from your React Native app!');
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      Alert.alert('Success', 'Form submitted successfully!');
    }, 2000);
  };

  return (
    <ScreenWrapper>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
        <View style={styles.body}>
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? '#fff' : '#000' }]}>
              {message}
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              This is your React Native app with Expo. You can now develop for both iOS and Android
              from your WSL2 environment.
            </Text>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Design System Components</Text>
              <Text style={styles.cardDescription}>
                Testing our new design system components with consistent styling.
              </Text>

              <FormInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.buttonContainer}>
                <PrimaryButton
                  title="Count: {count}"
                  onPress={handleButtonPress}
                  style={styles.button}
                />

                <PrimaryButton
                  title="Show Alert"
                  onPress={showAlert}
                  style={[styles.button, styles.alertButton]}
                />

                <PrimaryButton
                  title="Submit Form"
                  onPress={handleSubmit}
                  isLoading={isLoading}
                  style={styles.submitButton}
                />
              </View>
            </Card>

            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Web development working
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Mobile development ready
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Clerk authentication ready
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Design system implemented
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: theme.colors.background,
  },
  body: {
    backgroundColor: theme.colors.background,
  },
  sectionContainer: {
    marginTop: theme.spacing.s32,
  },
  sectionTitle: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.semibold,
    marginBottom: theme.spacing.s16,
    color: theme.colors.textPrimary,
  },
  sectionDescription: {
    marginTop: theme.spacing.s8,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.normal,
    lineHeight: 24,
    color: theme.colors.textSecondary,
  },
  card: {
    marginTop: theme.spacing.s24,
    marginBottom: theme.spacing.s24,
  },
  cardTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  cardDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s16,
  },
  buttonContainer: {
    marginTop: theme.spacing.s16,
    gap: theme.spacing.s12,
  },
  button: {
    marginBottom: theme.spacing.s8,
  },
  alertButton: {
    backgroundColor: theme.colors.error,
  },
  submitButton: {
    backgroundColor: theme.colors.secondary,
  },
});

export default App;
