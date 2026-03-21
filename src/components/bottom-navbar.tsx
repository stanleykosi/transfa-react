import HomeIcon from '@/assets/icons/home.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import SupportIcon from '@/assets/icons/Support.svg';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type NavItem = 'home' | 'settings' | 'gifts' | 'support';

interface BottomNavbarProps {
  activeTab: NavItem;
  onTabPress: (tab: NavItem) => void;
  visible?: boolean;
  visibilityValue?: SharedValue<number>;
}

export default function BottomNavbar({
  activeTab,
  onTabPress,
  visible = true,
  visibilityValue,
}: BottomNavbarProps) {
  const internalTranslateY = useSharedValue(0);
  const internalOpacity = useSharedValue(1);

  useEffect(() => {
    if (visibilityValue !== undefined) {
      return;
    }

    if (visible) {
      internalTranslateY.value = withTiming(0, { duration: 300 });
      internalOpacity.value = withTiming(1, { duration: 300 });
      return;
    }

    internalTranslateY.value = withTiming(100, { duration: 300 });
    internalOpacity.value = withTiming(0, { duration: 300 });
  }, [internalOpacity, internalTranslateY, visible, visibilityValue]);

  const animatedStyle = useAnimatedStyle(() => {
    if (visibilityValue !== undefined) {
      return {
        transform: [{ translateY: (1 - visibilityValue.value) * 100 }],
        opacity: visibilityValue.value,
      };
    }

    return {
      transform: [{ translateY: internalTranslateY.value }],
      opacity: internalOpacity.value,
    };
  });

  const navItems: {
    id: NavItem;
    Icon: React.ComponentType<{
      width?: number;
      height?: number;
      color?: string;
    }>;
  }[] = [
    { id: 'home', Icon: HomeIcon },
    { id: 'settings', Icon: SettingsIcon },
    { id: 'gifts', Icon: MoneyDropIcon },
    { id: 'support', Icon: SupportIcon },
  ];

  const handleTabPress = (tabId: NavItem) => {
    if (activeTab === tabId) {
      return;
    }

    onTabPress(tabId);
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.navbar}>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.Icon;

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.navItem}
              onPress={() => handleTabPress(item.id)}
            >
              <Icon width={25} height={25} color={isActive ? '#FFD300' : '#6C6B6B'} />
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingBottom: 20,
    alignItems: 'center',
    zIndex: 100,
    elevation: 100,
    pointerEvents: 'box-none',
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#4C4C4C',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
});
