import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('Welcome to TransfaApp!');

  const handleButtonPress = () => {
    setCount(count + 1);
    setMessage(`Button pressed ${count + 1} times!`);
  };

  const showAlert = () => {
    Alert.alert('Test Alert', 'This is a test alert from your React Native app!');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#000' : '#fff' }]}>
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

            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.button} onPress={handleButtonPress}>
                <Text style={styles.buttonText}>Count: {count}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.button, styles.alertButton]} onPress={showAlert}>
                <Text style={styles.buttonText}>Show Alert</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Web development working
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Mobile development ready
            </Text>
            <Text style={[styles.sectionDescription, { color: isDarkMode ? '#ccc' : '#333' }]}>
              ✅ Clerk authentication ready
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    backgroundColor: '#fff',
  },
  body: {
    backgroundColor: '#fff',
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  alertButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
