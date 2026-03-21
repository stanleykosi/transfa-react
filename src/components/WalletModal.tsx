import BankIcon from '@/assets/icons/bank.svg';
import CardIcon from '@/assets/icons/card.svg';
import CopyIcon from '@/assets/icons/copy.svg';
import WalletModalIllustration from '@/assets/images/wallet-modal.svg';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Alert, Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface WalletModalProps {
  visible: boolean;
  onClose: () => void;
  bankName?: string;
  accountNumber?: string;
}

export default function WalletModal({
  visible,
  onClose,
  bankName = 'Paystack-Titan',
  accountNumber = '7251933872',
}: WalletModalProps) {
  const handleCopyAccountNumber = async () => {
    await Clipboard.setStringAsync(accountNumber);
    Alert.alert('Copied', 'Account number copied to clipboard');
  };

  const svgWidth = SCREEN_WIDTH - 40;
  const svgHeight = svgWidth * (340 / 334);
  // White space starts at y=159.667 in a 340px tall SVG (47% from top)
  const whiteSpaceStart = svgHeight * (159.667 / 340);

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.content}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Illustration */}
          <View style={styles.header}>
            <WalletModalIllustration width={svgWidth} height={svgHeight} />
            {/* Extended white background to cover all content */}
            <View
              style={[
                styles.whiteBackgroundExtension,
                {
                  top: whiteSpaceStart,
                  height: 400,
                },
              ]}
            />
            {/* Account Details positioned over white space */}
            <View style={[styles.accountDetailsContainer, { top: whiteSpaceStart }]}>
              {/* Bank Name Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Bank Name</Text>
                <View style={styles.inputContainer}>
                  <View style={styles.inputIcon}>
                    <BankIcon width={20} height={20} />
                  </View>
                  <Text style={styles.inputText}>{bankName}</Text>
                </View>
              </View>

              {/* Account Number Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Account Number</Text>
                <View style={styles.inputContainer}>
                  <View style={styles.inputIcon}>
                    <CardIcon width={20} height={20} />
                  </View>
                  <Text style={styles.inputText}>{accountNumber}</Text>
                </View>
              </View>

              {/* Copy Account Number Button */}
              <TouchableOpacity style={styles.copyButton} onPress={handleCopyAccountNumber}>
                <CopyIcon width={20} height={20} />
                <Text style={styles.copyButtonText}>Copy Account Number</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    width: '100%',
    maxWidth: 335,
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    minHeight: 460,
  },
  whiteBackgroundExtension: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  accountDetailsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    paddingTop: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  field: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(108, 107, 107, 0.32)',
  },
  inputIcon: {
    marginRight: 12,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
});
