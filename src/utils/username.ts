export const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$/;

export const normalizeUsername = (value?: string | null): string => (value ?? '').trim();

export const usernameKey = (value?: string | null): string =>
  normalizeUsername(value).toLowerCase();

export const usernamesEqual = (a?: string | null, b?: string | null): boolean => {
  const left = usernameKey(a);
  return left !== '' && left === usernameKey(b);
};
