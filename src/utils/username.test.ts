import { describe, expect, it } from '@jest/globals';
import { normalizeUsername, usernameKey, usernamesEqual } from './username';

describe('username utilities', () => {
  it('normalizes username display values by trimming outer whitespace', () => {
    expect(normalizeUsername('  Alice_1  ')).toBe('Alice_1');
    expect(normalizeUsername('')).toBe('');
    expect(normalizeUsername(null)).toBe('');
    expect(normalizeUsername(undefined)).toBe('');
  });

  it('builds case-insensitive keys', () => {
    expect(usernameKey('  Alice_1  ')).toBe('alice_1');
    expect(usernameKey('ALICE_1')).toBe('alice_1');
    expect(usernameKey('')).toBe('');
  });

  it('compares usernames using canonical keys and rejects empty values', () => {
    expect(usernamesEqual(' Alice_1 ', 'alice_1')).toBe(true);
    expect(usernamesEqual('alice_1', 'alice_2')).toBe(false);
    expect(usernamesEqual('', 'alice_1')).toBe(false);
  });
});
