import React, { useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';

interface OtpCodeFieldProps {
  value: string;
  onChangeCode: (code: string) => void;
  length?: number;
  autoFocus?: boolean;
  rowStyle?: StyleProp<ViewStyle>;
}

const OtpCodeField: React.FC<OtpCodeFieldProps> = ({
  value,
  onChangeCode,
  length = 6,
  autoFocus = false,
  rowStyle,
}) => {
  const inputRef = useRef<TextInput | null>(null);

  const onCodeChange = (nextValue: string) => {
    const sanitized = nextValue.replace(/[^\d]/g, '').slice(0, length);
    onChangeCode(sanitized);
  };

  return (
    <>
      <Pressable style={[styles.otpRow, rowStyle]} onPress={() => inputRef.current?.focus()}>
        {Array.from({ length }).map((_, index) => {
          const digit = value[index];
          const isActive = index === value.length && value.length < length;
          return (
            <View key={index} style={[styles.otpBox, isActive && styles.otpBoxActive]}>
              <Text style={styles.otpValue}>{digit || '-'}</Text>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onCodeChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        style={styles.hiddenInput}
        maxLength={length}
      />
    </>
  );
};

const styles = StyleSheet.create({
  otpRow: {
    width: '100%',
    marginTop: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  otpBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    backgroundColor: 'rgba(79, 79, 79, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: '#FFD300',
    backgroundColor: 'rgba(79, 79, 79, 0.5)',
  },
  otpValue: {
    color: '#DCDCDC',
    fontSize: 21,
    fontWeight: '500',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
});

export default OtpCodeField;
