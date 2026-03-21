import { StyleSheet } from 'react-native';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

export const globalStyles = StyleSheet.create({
  primaryButton: {
    backgroundColor: '#FFD300',
    paddingVertical: verticalScale(16),
    borderRadius: scale(10),
  },
  primaryButtonText: {
    fontSize: moderateScale(18),
    color: '#000000',
    textAlign: 'center',
    fontFamily: 'Montserrat_700Bold',
  },
  primaryButtonWithMargin: {
    backgroundColor: '#FFD300',
    paddingVertical: verticalScale(16),
    borderRadius: scale(10),
    marginBottom: verticalScale(24),
  },
});
