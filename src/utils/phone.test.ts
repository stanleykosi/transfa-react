import {
  isValidAnchorNigerianPhoneNumber,
  normalizeNigerianPhoneInput,
  toAnchorNigerianPhoneNumber,
} from './phone';

describe('phone utils', () => {
  describe('normalizeNigerianPhoneInput', () => {
    it('normalizes +234 phone numbers for the UI input', () => {
      expect(normalizeNigerianPhoneInput('+2348181664488')).toBe('8181664488');
    });

    it('normalizes local phone numbers for the UI input', () => {
      expect(normalizeNigerianPhoneInput('08181664488')).toBe('8181664488');
    });
  });

  describe('toAnchorNigerianPhoneNumber', () => {
    it('converts +234 numbers into Anchor local format', () => {
      expect(toAnchorNigerianPhoneNumber('+2348181664488')).toBe('08181664488');
    });

    it('keeps valid local numbers unchanged', () => {
      expect(toAnchorNigerianPhoneNumber('08181664488')).toBe('08181664488');
    });

    it('rejects invalid numbers', () => {
      expect(toAnchorNigerianPhoneNumber('12345')).toBeNull();
      expect(isValidAnchorNigerianPhoneNumber('12345')).toBe(false);
    });
  });
});
