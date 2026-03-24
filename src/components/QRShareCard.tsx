import BottomWave from '@/assets/icons/bottom-wave.svg';
import FlashEffect from '@/assets/icons/flash-effect.svg';
import Logo from '@/assets/icons/logo.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import PhoneWave from '@/assets/icons/phone-wave.svg';
import RayEffect from '@/assets/icons/ray-effect.svg';
import ScanArrow from '@/assets/icons/scan-arrow.svg';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const CARD_WIDTH = 400;
const CARD_HEIGHT = 520;

interface QRShareCardProps {
  type: 'money-drop' | 'request' | 'profile';
  value: string;
  title?: string;
  username?: string;
}

export const QRShareCard = React.forwardRef<View, QRShareCardProps>(
  ({ type, value, username }, ref) => {
    if (type === 'profile' || type === 'request') {
      const isRequest = type === 'request';

      return (
        <View ref={ref} style={[styles.cardContainer, styles.profileCard]} collapsable={false}>
          <View style={styles.waveDecoration}>
            <BottomWave width={CARD_WIDTH} height={165} />
          </View>

          <View style={styles.profileHeaderBanner}>
            {isRequest ? (
              <View style={styles.scanToPayContainer}>
                <Text style={styles.scanTextBig}>SCAN</Text>
                <View style={styles.toBadgeIcon}>
                  <Text style={styles.toTextSmall}>to</Text>
                </View>
                <Text style={styles.scanTextBig}>PAY</Text>
              </View>
            ) : (
              <Logo width={160} height={48} />
            )}
          </View>

          <View style={styles.profileQRContainer}>
            <View style={styles.raysDecoration}>
              <RayEffect width={80} height={80} />
            </View>
            <View style={styles.flashDecoration}>
              <FlashEffect width={60} height={60} />
            </View>

            <View style={styles.profileQRWrapper}>
              <QRCode
                value={value}
                size={200}
                color="black"
                backgroundColor="white"
                quietZone={10}
              />
              <View style={styles.qrLogoCenter}>
                <Logo width={40} height={40} />
              </View>
            </View>

            <View style={styles.phoneDecoration}>
              <PhoneWave width={100} height={100} />
            </View>

            <View style={styles.scanArrowContainer}>
              <ScanArrow width={140} height={60} />
            </View>
          </View>

          <View style={styles.profileFooterContainer}>
            {isRequest ? (
              <View style={styles.footerBranding}>
                <Logo width={100} height={30} color="#FFF" />
              </View>
            ) : null}

            <View style={styles.profileFooter}>
              <Text style={styles.usernameLabel}>Username:</Text>
              <Text style={styles.usernameValue}>{username || 'USER'}</Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View ref={ref} style={styles.cardContainer} collapsable={false}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.brandText}>Transfa</Text>
            <View style={styles.iconBox}>
              <View style={styles.innerIcon} />
            </View>
            <Text style={styles.multiply}>×</Text>
            <Text style={styles.typeText}>{type === 'money-drop' ? 'MoneyDrop' : 'Request'}</Text>
          </View>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>SCAN</Text>
          <View style={styles.toBadge}>
            <Text style={styles.toText}>to</Text>
          </View>
          <Text style={styles.mainTitle}>{type === 'money-drop' ? 'CLAIM' : 'PAY'}</Text>
        </View>

        <View style={styles.qrWrapper}>
          <View style={styles.qrInner}>
            <QRCode value={value} size={220} color="black" backgroundColor="white" quietZone={10} />
            <View style={styles.qrLogoCenter}>
              <MoneyDropIcon width={40} height={40} color="#FFD300" />
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.giftBoxUnderlay} />
          <View style={styles.giftBoxMain} />
          <View style={styles.giftBoxLid} />
          <View
            style={[styles.confetti, { top: 10, left: 40, transform: [{ rotate: '45deg' }] }]}
          />
          <View
            style={[styles.confetti, { top: 0, right: 40, transform: [{ rotate: '-20deg' }] }]}
          />
        </View>
      </View>
    );
  }
);

QRShareCard.displayName = 'QRShareCard';

const styles = StyleSheet.create({
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#0F0F0F',
    padding: 30,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileCard: {
    backgroundColor: '#FFD300',
    padding: 0,
    justifyContent: 'flex-start',
  },
  profileHeaderBanner: {
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 40,
    gap: 15,
  },
  profileQRContainer: {
    marginTop: 50,
    position: 'relative',
    alignItems: 'center',
    zIndex: 10,
  },
  profileQRWrapper: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  raysDecoration: {
    position: 'absolute',
    top: -30,
    right: -20,
  },
  flashDecoration: {
    position: 'absolute',
    top: -10,
    right: -40,
  },
  phoneDecoration: {
    position: 'absolute',
    right: -100,
    bottom: -20,
    transform: [{ rotate: '15deg' }],
  },
  scanArrowContainer: {
    position: 'absolute',
    left: -120,
    bottom: -30,
    transform: [{ rotate: '-15deg' }],
  },
  profileFooter: {
    backgroundColor: '#FFF',
    marginTop: 'auto',
    marginBottom: 30,
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 160,
    zIndex: 10,
  },
  usernameLabel: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'Montserrat_500Medium',
  },
  usernameValue: {
    fontSize: 20,
    color: '#000',
    fontFamily: 'ArtificTrial-Bold',
    textTransform: 'uppercase',
  },
  waveDecoration: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 165,
    zIndex: 1,
  },
  scanToPayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanTextBig: {
    color: '#FFF',
    fontSize: 48,
    fontFamily: 'ArtificTrial-Bold',
  },
  toBadgeIcon: {
    backgroundColor: '#FFD300',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    transform: [{ rotate: '-5deg' }],
  },
  toTextSmall: {
    color: '#000',
    fontSize: 24,
    fontFamily: 'ArtificTrial-Bold',
  },
  profileFooterContainer: {
    marginTop: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 30,
    paddingBottom: 30,
    zIndex: 10,
  },
  footerBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  header: {
    marginTop: 10,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'ArtificTrial-Semibold',
  },
  iconBox: {
    width: 24,
    height: 16,
    backgroundColor: '#FFD300',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  innerIcon: {
    width: '100%',
    height: 2,
    backgroundColor: '#000',
    borderRadius: 1,
  },
  multiply: {
    color: '#6C6B6B',
    fontSize: 18,
  },
  typeText: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'Montserrat_500Medium',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  mainTitle: {
    color: '#FFF',
    fontSize: 48,
    fontFamily: 'ArtificTrial-Bold',
    letterSpacing: -1,
  },
  toBadge: {
    backgroundColor: '#FFD300',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginHorizontal: 8,
    transform: [{ rotate: '-5deg' }],
  },
  toText: {
    color: '#000',
    fontSize: 22,
    fontFamily: 'ArtificTrial-Bold',
  },
  qrWrapper: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  qrInner: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrLogoCenter: {
    position: 'absolute',
    backgroundColor: '#FFF',
    padding: 4,
    borderRadius: 8,
  },
  footer: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  giftBoxUnderlay: {
    position: 'absolute',
    bottom: -10,
    width: 140,
    height: 120,
    backgroundColor: '#FFD30022',
    borderRadius: 70,
    transform: [{ scaleX: 1.5 }],
  },
  giftBoxMain: {
    width: 120,
    height: 60,
    backgroundColor: '#FFD300',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  giftBoxLid: {
    width: 130,
    height: 20,
    backgroundColor: '#FFE14D',
    borderRadius: 4,
    marginBottom: 58,
    position: 'absolute',
    transform: [{ rotate: '-10deg' }, { translateY: -40 }],
  },
  confetti: {
    position: 'absolute',
    width: 12,
    height: 6,
    backgroundColor: '#FFD300',
    borderRadius: 2,
  },
});
