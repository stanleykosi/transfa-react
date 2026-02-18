import type { InAppNotification, PaymentRequest } from '@/types/api';
import { normalizeUsername } from '@/utils/username';

export const BRAND_YELLOW = '#FFD300';

// Legacy name kept for compatibility; this only trims surrounding whitespace.
export const stripUsernamePrefix = (value?: string | null) => normalizeUsername(value || '');

export const formatShortDate = (iso?: string) => {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const normalizeRequestStatus = (raw?: string): PaymentRequest['display_status'] => {
  const status = (raw || '').toLowerCase();
  if (status === 'fulfilled' || status === 'paid') {
    return 'paid';
  }
  if (status === 'declined') {
    return 'declined';
  }
  return 'pending';
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const resolveRequestNotificationMeta = (notification: InAppNotification) => {
  const data = notification.data || {};

  return {
    requestId: readString(data.request_id) || notification.related_entity_id,
    actorUsername:
      readString(data.actor_username) ||
      readString(data.paid_by_username) ||
      readString(data.declined_by_username) ||
      readString(data.sender_username),
    actorFullName: readString(data.actor_full_name),
    amount: readNumber(data.amount),
    status: normalizeRequestStatus(readString(data.display_status) || readString(data.status)),
    title: readString(data.title),
  };
};
