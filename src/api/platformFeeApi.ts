/**
 * @description
 * TanStack Query hooks for platform fee APIs.
 */
import { useQuery } from '@tanstack/react-query';
import apiClient from './apiClient';
import { PlatformFeeInvoice, PlatformFeeStatus } from '@/types/api';

const PLATFORM_FEE_SERVICE_URL =
  process.env.EXPO_PUBLIC_PLATFORM_FEE_SERVICE_URL || 'http://localhost:8086';

export const PLATFORM_FEE_STATUS_QUERY_KEY = 'platformFeeStatus';
export const PLATFORM_FEE_INVOICES_QUERY_KEY = 'platformFeeInvoices';

export const usePlatformFeeStatus = () => {
  const fetchStatus = async (): Promise<PlatformFeeStatus> => {
    const { data } = await apiClient.get<PlatformFeeStatus>('/platform-fees/status', {
      baseURL: PLATFORM_FEE_SERVICE_URL,
    });
    return data;
  };

  return useQuery<PlatformFeeStatus, Error>({
    queryKey: [PLATFORM_FEE_STATUS_QUERY_KEY],
    queryFn: fetchStatus,
  });
};

export const usePlatformFeeInvoices = () => {
  const fetchInvoices = async (): Promise<PlatformFeeInvoice[]> => {
    const { data } = await apiClient.get<PlatformFeeInvoice[]>('/platform-fees/invoices', {
      baseURL: PLATFORM_FEE_SERVICE_URL,
    });
    return data;
  };

  return useQuery<PlatformFeeInvoice[], Error>({
    queryKey: [PLATFORM_FEE_INVOICES_QUERY_KEY],
    queryFn: fetchInvoices,
  });
};
