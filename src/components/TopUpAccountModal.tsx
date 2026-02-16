import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

type TopUpAccountModalProps = {
  visible: boolean;
  onClose: () => void;
  accountNumber?: string;
  bankName?: string;
  isLoading?: boolean;
};

const PLACEHOLDER_BANK = 'Account provisioning in progress';
const PLACEHOLDER_ACCOUNT = 'Account number unavailable';

const TopUpAccountModal = ({
  visible,
  onClose,
  accountNumber,
  bankName,
  isLoading = false,
}: TopUpAccountModalProps) => {
  const hasAccountDetails = !!accountNumber;

  const handleCopy = async () => {
    if (!accountNumber) {
      return;
    }

    await Clipboard.setStringAsync(accountNumber);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayPressable} onPress={onClose} />

        <View style={styles.card}>
          <View style={styles.artworkArea}>
            <View style={styles.sun} />
            <View style={[styles.cloud, styles.cloudOne]} />
            <View style={[styles.cloud, styles.cloudTwo]} />
            <View style={[styles.cloud, styles.cloudThree]} />

            <View style={styles.buildingGroup}>
              <View style={styles.buildingMain} />
              <View style={styles.buildingWing} />
              <View style={styles.buildingBase} />
            </View>

            <View style={styles.lowerCloudLayer} />
          </View>

          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#111" />
                <Text style={styles.loadingText}>Loading account details...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Bank Name</Text>
                <View style={styles.detailBox}>
                  <Ionicons name="business-outline" size={18} color="#2D2D2F" />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {bankName?.trim() || PLACEHOLDER_BANK}
                  </Text>
                </View>

                <Text style={styles.label}>Account Number</Text>
                <View style={styles.detailBox}>
                  <Ionicons name="card-outline" size={18} color="#2D2D2F" />
                  <Text style={styles.detailText}>
                    {accountNumber?.trim() || PLACEHOLDER_ACCOUNT}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.copyButton, !hasAccountDetails && styles.copyButtonDisabled]}
                  onPress={handleCopy}
                  activeOpacity={0.85}
                  disabled={!hasAccountDetails}
                >
                  <Ionicons name="copy-outline" size={19} color="#111" />
                  <Text style={styles.copyButtonText}>Copy Account Number</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F0F0F1',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
  },
  artworkArea: {
    height: 170,
    backgroundColor: '#FFBF4E',
    position: 'relative',
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    top: -58,
    left: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,234,160,0.62)',
  },
  cloud: {
    position: 'absolute',
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  cloudOne: {
    top: 32,
    left: 128,
    width: 48,
  },
  cloudTwo: {
    top: 44,
    left: 210,
    width: 72,
  },
  cloudThree: {
    top: 64,
    left: 86,
    width: 60,
  },
  buildingGroup: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 128,
    height: 86,
  },
  buildingMain: {
    position: 'absolute',
    right: 38,
    top: 2,
    width: 56,
    height: 70,
    backgroundColor: '#FFB400',
  },
  buildingWing: {
    position: 'absolute',
    right: 0,
    top: 20,
    width: 62,
    height: 52,
    backgroundColor: '#F7C54A',
  },
  buildingBase: {
    position: 'absolute',
    right: 26,
    bottom: 0,
    width: 94,
    height: 20,
    backgroundColor: '#F0CF74',
  },
  lowerCloudLayer: {
    position: 'absolute',
    left: -12,
    right: -12,
    bottom: -26,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EFEFF0',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  loadingWrap: {
    height: 188,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#44464A',
    fontSize: 13,
    fontWeight: '500',
  },
  label: {
    color: '#24262A',
    fontSize: 12,
    marginBottom: 6,
  },
  detailBox: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CDCED3',
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  detailText: {
    color: '#131416',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  copyButton: {
    marginTop: 2,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  copyButtonDisabled: {
    opacity: 0.45,
  },
  copyButtonText: {
    color: '#111214',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default TopUpAccountModal;
