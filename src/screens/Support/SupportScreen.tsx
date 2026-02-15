import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const SupportScreen = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="headset" size={34} color="#FFD300" />
        </View>
        <Text style={styles.title}>Customer Support</Text>
        <Text style={styles.subtitle}>Support channels and ticketing will be connected here.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050607',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iconWrap: {
    width: 78,
    height: 78,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '700',
    color: '#F2F2F2',
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 280,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#ACADB1',
  },
});

export default SupportScreen;
