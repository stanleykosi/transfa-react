import type { AppStackParamList } from '@/navigation/AppStack';

export const TRANSFER_BRAND_YELLOW = '#FFD300';
export const TRANSFER_BG_BOTTOM = '#050607';

const DEFAULT_MIN_PROCESSING_CARD_MS = 700;

export const toTransferSettlementStatus = (
  status?: string
): AppStackParamList['TransferStatus']['initialStatus'] => {
  const normalized = (status ?? 'pending').toLowerCase();
  if (normalized === 'completed' || normalized === 'successful' || normalized === 'success') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'cancelled') {
    return 'failed';
  }
  if (normalized === 'processing' || normalized === 'initiated') {
    return 'processing';
  }
  return 'pending';
};

export const waitForMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const ensureMinimumProcessingDisplay = async (
  startedAt: number,
  minimumDurationMs = DEFAULT_MIN_PROCESSING_CARD_MS
) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minimumDurationMs) {
    await waitForMs(minimumDurationMs - elapsed);
  }
};
