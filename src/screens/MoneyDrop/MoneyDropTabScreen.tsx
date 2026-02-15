import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const MoneyDropTabScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="gift" size={34} color="#FFD300" />
        </View>
        <Text style={styles.title}>MoneyDrop</Text>
        <Text style={styles.subtitle}>Launch quick drops for friends and communities.</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.button}
          onPress={() => navigation.navigate('CreateDropWizard' as never)}
        >
          <Text style={styles.buttonText}>Create MoneyDrop</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#ACADB1',
    maxWidth: 280,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#0A0C0D',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default MoneyDropTabScreen;
