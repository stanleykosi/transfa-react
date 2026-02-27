const NIGERIA_COUNTRY_CODE = '234';
const NIGERIA_LOCAL_PHONE_PATTERN = /^0\d{10}$/;

export const cleanPhoneDigits = (value: string): string => value.replace(/\D/g, '');

export const normalizeNigerianPhoneInput = (value: string): string => {
  let digits = cleanPhoneDigits(value);
  if (digits.startsWith(`${NIGERIA_COUNTRY_CODE}0`)) {
    digits = digits.slice(NIGERIA_COUNTRY_CODE.length + 1);
  } else if (digits.startsWith(NIGERIA_COUNTRY_CODE)) {
    digits = digits.slice(NIGERIA_COUNTRY_CODE.length);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
};

export const toAnchorNigerianPhoneNumber = (value: string): string | null => {
  let digits = cleanPhoneDigits(value);
  if (digits.startsWith(`${NIGERIA_COUNTRY_CODE}0`) && digits.length === 14) {
    digits = digits.slice(NIGERIA_COUNTRY_CODE.length);
  } else if (digits.startsWith(NIGERIA_COUNTRY_CODE) && digits.length === 13) {
    digits = `0${digits.slice(NIGERIA_COUNTRY_CODE.length)}`;
  } else if (digits.length === 10) {
    digits = `0${digits}`;
  }

  if (!NIGERIA_LOCAL_PHONE_PATTERN.test(digits)) {
    return null;
  }

  return digits;
};

export const isValidAnchorNigerianPhoneNumber = (value: string): boolean =>
  toAnchorNigerianPhoneNumber(value) !== null;
