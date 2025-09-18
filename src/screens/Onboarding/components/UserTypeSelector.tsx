/**
 * @description
 * A component that allows users to select their account type ('Personal' or 'Merchant').
 * It displays two selectable cards and provides visual feedback for the active selection.
 *
 * @dependencies
 * - react-native: For core UI components like View, Text, TouchableOpacity.
 * - @expo/vector-icons: For displaying icons on the selection cards.
 * - @/constants/theme: For consistent styling.
 *
 * @props
 * - selectedType ('personal' | 'merchant'): The currently selected user type.
 * - onSelectType ((type: 'personal' | 'merchant') => void): Callback function when a type is selected.
 *
 * @example
 * <UserTypeSelector selectedType={userType} onSelectType={setUserType} />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type UserType = 'personal' | 'merchant';

interface UserTypeSelectorProps {
  selectedType: UserType;
  onSelectType: (type: UserType) => void;
}

const UserTypeSelector: React.FC<UserTypeSelectorProps> = ({ selectedType, onSelectType }) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.card, selectedType === 'personal' && styles.selectedCard]}
        onPress={() => onSelectType('personal')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="person-outline"
          size={32}
          color={selectedType === 'personal' ? theme.colors.primary : theme.colors.textPrimary}
        />
        <Text style={[styles.cardText, selectedType === 'personal' && styles.selectedCardText]}>
          Personal
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, selectedType === 'merchant' && styles.selectedCard]}
        onPress={() => onSelectType('merchant')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="business-outline"
          size={32}
          color={selectedType === 'merchant' ? theme.colors.primary : theme.colors.textPrimary}
        />
        <Text style={[styles.cardText, selectedType === 'merchant' && styles.selectedCardText]}>
          Merchant
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s32,
  },
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: theme.spacing.s8,
    minHeight: 120,
  },
  selectedCard: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F0F2FF', // A light primary color
  },
  cardText: {
    marginTop: theme.spacing.s8,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  selectedCardText: {
    color: theme.colors.primary,
  },
});

export default UserTypeSelector;
