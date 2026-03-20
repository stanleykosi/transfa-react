import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Based on iPhone 14 Pro (393pt wide, 852pt tall)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

// Scales a value proportionally to screen width
export const scale = (size: number) => (width / BASE_WIDTH) * size;

// Scales a value proportionally to screen height
export const verticalScale = (size: number) => (height / BASE_HEIGHT) * size;

// A gentler scale that doesn't grow as aggressively on larger screens
export const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

export { height as SCREEN_HEIGHT, width as SCREEN_WIDTH };
