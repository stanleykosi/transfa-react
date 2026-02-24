const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRUSTED_SCAN_HOSTS = new Set([
  'trytransfa.com',
  'www.trytransfa.com',
  'transfa.app',
  'www.transfa.app',
]);

const RESERVED_PROFILE_SEGMENTS = new Set([
  'pay',
  'payment',
  'payments',
  'request',
  'requests',
  'moneydrop',
  'money-drop',
  'claim',
  'scan',
]);

const PROFILE_SEGMENT_PATTERN = /^[a-z0-9._]{3,50}$/i;

const isTrustedHost = (host: string): boolean => TRUSTED_SCAN_HOSTS.has(host.toLowerCase());
const isTransfaAppHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return normalized === 'transfa.app' || normalized === 'www.transfa.app';
};

export type ParsedScanPayload =
  | {
      type: 'money_drop';
      dropId: string;
      rawValue: string;
    }
  | {
      type: 'payment_request';
      requestId: string;
      rawValue: string;
    }
  | {
      type: 'user_profile';
      username: string;
      rawValue: string;
    }
  | {
      type: 'unknown';
      rawValue: string;
    };

const sanitizeUuidCandidate = (value: string | null): string | null => {
  const trimmed = (value || '').trim();
  if (!UUID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
};

const buildUrlCandidate = (rawValue: string): URL | null => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return isTrustedHost(parsed.hostname) ? parsed : null;
  } catch {
    // Continue with safe fallbacks.
  }

  if (/^www\./i.test(trimmed)) {
    try {
      const parsed = new URL(`https://${trimmed}`);
      return isTrustedHost(parsed.hostname) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (
    /(^|\/\/)(trytransfa\.com|www\.trytransfa\.com|transfa\.app|www\.transfa\.app)\b/i.test(trimmed)
  ) {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      return isTrustedHost(parsed.hostname) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
};

const parseMoneyDrop = (url: URL): string | null => {
  const queryDrop =
    sanitizeUuidCandidate(url.searchParams.get('drop_id')) ||
    sanitizeUuidCandidate(url.searchParams.get('money_drop_id'));
  if (queryDrop) {
    return queryDrop;
  }

  const segments = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const asUuid = sanitizeUuidCandidate(segment);
    if (asUuid && segments.some((entry) => /money[-_]?drop/i.test(entry))) {
      return asUuid;
    }
  }

  return null;
};

const parsePaymentRequest = (url: URL): string | null => {
  const queryRequest =
    sanitizeUuidCandidate(url.searchParams.get('request_id')) ||
    sanitizeUuidCandidate(url.searchParams.get('payment_request_id'));
  if (queryRequest) {
    return queryRequest;
  }

  const segments = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const trailing = segments[segments.length - 1];
  const trailingUuid = sanitizeUuidCandidate(trailing || '');
  if (trailingUuid && segments.some((segment) => /pay|request/i.test(segment))) {
    return trailingUuid;
  }

  return null;
};

const parseProfileUsername = (url: URL): string | null => {
  const segment = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  if (!segment) {
    return null;
  }

  const normalized = segment.toLowerCase();
  // Avoid classifying product routes (for example /pay) on transfa.app as profiles.
  if (isTransfaAppHost(url.hostname) && RESERVED_PROFILE_SEGMENTS.has(normalized)) {
    return null;
  }
  if (!PROFILE_SEGMENT_PATTERN.test(segment)) {
    return null;
  }

  // Avoid parsing plain numeric IDs or UUID-like content as usernames.
  if (!/[a-z]/i.test(segment) || UUID_PATTERN.test(segment)) {
    return null;
  }

  return segment;
};

export const parseScannedPayload = (rawValue: string): ParsedScanPayload => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { type: 'unknown', rawValue };
  }

  const parsedUrl = buildUrlCandidate(trimmed);
  if (parsedUrl) {
    const dropId = parseMoneyDrop(parsedUrl);
    if (dropId) {
      return { type: 'money_drop', dropId, rawValue: trimmed };
    }

    const requestId = parsePaymentRequest(parsedUrl);
    if (requestId) {
      return { type: 'payment_request', requestId, rawValue: trimmed };
    }

    const username = parseProfileUsername(parsedUrl);
    if (username) {
      return { type: 'user_profile', username, rawValue: trimmed };
    }
  }

  if (
    PROFILE_SEGMENT_PATTERN.test(trimmed) &&
    /[a-z]/i.test(trimmed) &&
    !UUID_PATTERN.test(trimmed)
  ) {
    return { type: 'user_profile', username: trimmed, rawValue: trimmed };
  }

  return { type: 'unknown', rawValue: trimmed };
};
