import AvatarDefaultIcon from '@/assets/icons/avatar-default.svg';
import Recieve from '@/assets/icons/recieve.svg';
import Send from '@/assets/icons/send.svg';
import ShareIcon from '@/assets/icons/Share1.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type AvatarKey = 'avatar' | 'avatar1' | 'avatar2' | 'avatar3';

export interface UserProfileModalTransaction {
  id: string;
  type: 'sent' | 'received';
  description: string;
  amount: number;
}

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  fullName: string;
  avatar?: AvatarKey;
  verified?: boolean;
  transactions: UserProfileModalTransaction[];
  isLoading?: boolean;
  isRefetching?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onSend: () => void;
  onRequest: () => void;
  onShare: () => void;
}

const avatarMap: Record<AvatarKey, React.ComponentType<{ width?: number; height?: number }>> = {
  avatar: Avatar,
  avatar1: Avatar1,
  avatar2: Avatar2,
  avatar3: Avatar3,
};

const formatAmount = (amount: number) => {
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const TransactionItem = React.memo(
  ({
    transaction,
    AvatarComponent,
  }: {
    transaction: UserProfileModalTransaction;
    AvatarComponent: React.ComponentType<{ width?: number; height?: number }>;
  }) => {
    const isFromCurrentUser = transaction.type === 'sent';
    const SenderAvatar = isFromCurrentUser ? Avatar : AvatarComponent;
    const ReceiverAvatar = isFromCurrentUser ? AvatarComponent : Avatar;

    return (
      <View style={styles.transactionItem}>
        <View style={styles.transactionAvatars}>
          <View style={styles.avatarStackContainer}>
            <View style={styles.avatarBack}>
              <SenderAvatar width={32} height={32} />
            </View>
            <View style={styles.avatarFront}>
              <ReceiverAvatar width={32} height={32} />
            </View>
          </View>
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionDescription}>{transaction.description}</Text>
        </View>
        <Text
          style={[
            styles.transactionAmount,
            transaction.type === 'sent' ? styles.sentAmount : styles.receivedAmount,
          ]}
        >
          {transaction.type === 'sent' ? '-' : '+'}
          {formatAmount(transaction.amount)}
        </Text>
      </View>
    );
  }
);

const UserProfileBackdrop = ({
  animatedIndex,
  style,
  onPress,
}: {
  animatedIndex: { value: number };
  style: any;
  onPress: () => void;
}) => {
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[style, containerAnimatedStyle, { backgroundColor: 'rgba(0,0,0,0.1)' }]}>
      <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
    </Animated.View>
  );
};

export default function UserProfileModal({
  visible,
  onClose,
  username,
  fullName,
  avatar = 'avatar1',
  verified = true,
  transactions,
  isLoading = false,
  isRefetching = false,
  isError = false,
  errorMessage,
  onRetry,
  onSend,
  onRequest,
  onShare,
}: UserProfileModalProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const animatedIndex = useSharedValue(-1);
  const animatedPosition = useSharedValue(SCREEN_HEIGHT);

  const AvatarComponent = avatarMap[avatar] || null;
  const snapPoints = useMemo(() => ['80%'], []);
  const TOP_BAR_OFFSET = useMemo(() => scale(65), []);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        bottomSheetRef.current?.expand();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const sheetTopY = SCREEN_HEIGHT * 0.2;

    const opacity = interpolate(
      animatedPosition.value,
      [SCREEN_HEIGHT, sheetTopY],
      [0, 1],
      Extrapolation.CLAMP
    );

    const translateY = interpolate(
      animatedPosition.value,
      [SCREEN_HEIGHT, sheetTopY],
      [SCREEN_HEIGHT - TOP_BAR_OFFSET, sheetTopY - TOP_BAR_OFFSET],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const handleSend = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend();
  }, [onSend]);

  const handleRequest = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRequest();
  }, [onRequest]);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    bottomSheetRef.current?.close();
  }, []);

  const handleShare = useCallback(() => {
    Haptics.selectionAsync();
    onShare();
  }, [onShare]);

  const renderBackdrop = useCallback(
    (props: any) => <UserProfileBackdrop {...props} onPress={handleClose} />,
    [handleClose]
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <View style={styles.container} pointerEvents={visible ? 'auto' : 'none'}>
      <BottomSheet
        ref={bottomSheetRef}
        index={visible ? 0 : -1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        enableOverDrag={true}
        enableDynamicSizing={false}
        enableHandlePanningGesture={true}
        enableContentPanningGesture={true}
        backdropComponent={renderBackdrop}
        animatedIndex={animatedIndex}
        animatedPosition={animatedPosition}
        onChange={handleSheetChange}
        handleIndicatorStyle={styles.dragHandle}
        backgroundStyle={styles.sheetBackground}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {AvatarComponent ? (
              <AvatarComponent width={140} height={140} />
            ) : (
              <View style={styles.defaultAvatarContainer}>
                <AvatarDefaultIcon width={70} height={70} color="#ffffff" />
              </View>
            )}
            {verified ? (
              <View style={styles.verifiedBadgeContainer}>
                <VerifiedBadge width={40} height={40} />
              </View>
            ) : null}
          </View>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.fullName}>{fullName}</Text>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.actionButtons}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={handleSend}
            >
              <View style={styles.actionButtonIcon}>
                <Send width={24} height={24} color="#ffffff" />
              </View>
              <Text style={styles.actionButtonText}>Send</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={handleRequest}
            >
              <View style={styles.actionButtonIcon}>
                <Recieve width={24} height={24} color="#ffffff" />
              </View>
              <Text style={styles.actionButtonText}>Request</Text>
            </Pressable>
          </View>

          <View style={[styles.transactionSection, { paddingBottom: insets.bottom }]}>
            <View style={styles.transactionHeader}>
              <Text style={styles.transactionTitle}>Transaction History</Text>
              {(isLoading || isRefetching) && <ActivityIndicator size="small" color="#000000" />}
            </View>
            {isError ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>
                  {errorMessage || 'Unable to load transactions.'}
                </Text>
                {onRetry ? (
                  <Pressable style={styles.retryButton} onPress={onRetry}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : isLoading && transactions.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>Loading transactions...</Text>
              </View>
            ) : transactions.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>No transactions with this user yet.</Text>
              </View>
            ) : (
              <BottomSheetFlatList
                data={transactions}
                keyExtractor={(item: UserProfileModalTransaction) => item.id}
                renderItem={({ item }: { item: UserProfileModalTransaction }) => (
                  <TransactionItem
                    transaction={item}
                    AvatarComponent={AvatarComponent || Avatar1}
                  />
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.transactionListContent}
                nestedScrollEnabled
              />
            )}
          </View>
        </View>
      </BottomSheet>

      <Animated.View style={[styles.modalTopBar, headerAnimatedStyle]}>
        <View style={styles.modalTopBarContent}>
          <Pressable
            style={({ pressed }) => [styles.floatingButton, pressed && { opacity: 0.7 }]}
            onPress={handleClose}
          >
            <Text style={styles.floatingButtonText}>✕</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.floatingButton, pressed && { opacity: 0.7 }]}
            onPress={handleShare}
          >
            <ShareIcon width={20} height={20} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    borderCurve: 'continuous',
  },
  dragHandle: {
    backgroundColor: '#CCCCCC',
    width: scale(60),
  },
  modalTopBar: {
    position: 'absolute',
    top: verticalScale(8),
    left: 0,
    right: 0,
    zIndex: 100,
  },
  modalTopBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    width: '100%',
  },
  floatingButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingButtonText: {
    fontSize: moderateScale(20),
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: verticalScale(28),
    paddingBottom: verticalScale(24),
    backgroundColor: '#FFFFFF',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: verticalScale(16),
  },
  defaultAvatarContainer: {
    width: 140,
    height: 140,
    backgroundColor: '#000000',
    borderRadius: 40,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  username: {
    fontSize: moderateScale(36),
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: verticalScale(8),
  },
  fullName: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  contentArea: {
    backgroundColor: '#FFFFFF',
    paddingTop: verticalScale(20),
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: scale(16),
    paddingHorizontal: scale(20),
    marginBottom: verticalScale(38),
  },
  actionButton: {
    maxWidth: SCREEN_WIDTH * 0.31,
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 1)',
    borderRadius: scale(20),
    borderCurve: 'continuous',
    height: verticalScale(90),
    paddingHorizontal: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonIcon: {
    marginBottom: verticalScale(14),
  },
  actionButtonText: {
    fontSize: moderateScale(17),
    color: '#ffffff',
    fontFamily: 'Montserrat_500Medium',
  },
  transactionSection: {
    flex: 1,
    paddingHorizontal: scale(20),
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(16),
  },
  transactionTitle: {
    fontSize: moderateScale(18),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  transactionListContent: {
    paddingBottom: verticalScale(20),
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: scale(12),
    borderCurve: 'continuous',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: 'rgba(256, 256, 256, 0.06)',
  },
  transactionAvatars: {
    marginRight: scale(12),
    width: scale(40),
    height: scale(40),
  },
  avatarStackContainer: {
    width: scale(40),
    height: scale(40),
    position: 'relative',
  },
  avatarBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
    overflow: 'hidden',
    transform: [{ rotate: '-15deg' }],
  },
  avatarFront: {
    position: 'absolute',
    left: scale(15),
    top: scale(15),
    zIndex: 2,
    overflow: 'hidden',
    transform: [{ rotate: '15deg' }],
  },
  transactionDetails: {
    flex: 1,
    marginLeft: scale(12),
    marginRight: scale(20),
  },
  transactionDescription: {
    fontSize: moderateScale(14),
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  transactionAmount: {
    fontSize: moderateScale(16),
    fontFamily: 'Montserrat_600SemiBold',
    color: '#000000',
  },
  sentAmount: {
    color: '#000000',
  },
  receivedAmount: {
    color: '#000000',
  },
  stateCard: {
    borderRadius: scale(12),
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    gap: verticalScale(10),
  },
  stateText: {
    fontSize: moderateScale(14),
    color: '#111111',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    minWidth: scale(96),
    height: verticalScale(36),
    borderRadius: scale(10),
    borderCurve: 'continuous',
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(12),
  },
  retryButtonText: {
    fontSize: moderateScale(14),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
});
