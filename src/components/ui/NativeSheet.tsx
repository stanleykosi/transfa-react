import React, { useCallback, useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import * as Responsive from '@/utils/responsive';

interface NativeSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  maxHeight?: any;
}

export default function NativeSheet({
  visible,
  onClose,
  title,
  children,
  contentContainerStyle,
  maxHeight = '85%',
}: NativeSheetProps) {
  const translateY = useSharedValue(Responsive.moderateScale(1000));
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 300 });
      backdropOpacity.value = withTiming(1, { duration: 300 });
    } else {
      translateY.value = withTiming(Responsive.moderateScale(1000), {
        duration: 300,
      });
      backdropOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [visible, backdropOpacity, translateY]);

  const startY = useSharedValue(0);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(Responsive.moderateScale(1000), { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
    backdropOpacity.value = withTiming(0, { duration: 250 });
  }, [onClose, translateY, backdropOpacity]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          const newY = startY.value + event.translationY;
          if (newY >= 0) {
            translateY.value = newY;
          }
        })
        .onEnd((event) => {
          if (event.velocityY > 500 || translateY.value > 150) {
            runOnJS(handleClose)();
          } else {
            translateY.value = withTiming(0, { duration: 250 });
          }
        })
        .activeOffsetY([10, -10]),
    [handleClose, startY, translateY]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.overlay, backdropStyle]}>
          <Pressable style={styles.backdrop} onPress={handleClose} />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.modalContent,
              { maxHeight },
              Platform.OS === 'ios' && styles.modalContentIos,
              sheetStyle,
            ]}
          >
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={handleClose} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <View style={[styles.childrenContainer, contentContainerStyle]}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: Responsive.scale(25),
    borderTopRightRadius: Responsive.scale(25),
    borderCurve: 'continuous',
    maxHeight: '85%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  modalContentIos: {
    borderTopLeftRadius: Responsive.scale(25),
    borderTopRightRadius: Responsive.scale(25),
  },
  dragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: Responsive.verticalScale(12),
  },
  dragHandle: {
    width: Responsive.scale(50),
    height: Responsive.verticalScale(5),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Responsive.scale(2.5),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Responsive.scale(24),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: Responsive.moderateScale(22),
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
  },
  modalCloseButton: {
    width: Responsive.scale(36),
    height: Responsive.scale(36),
    borderRadius: Responsive.scale(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: Responsive.moderateScale(18),
    color: '#FFFFFF',
  },
  childrenContainer: {
    flex: 1,
  },
});
