import { useQuery } from '@tanstack/react-query';
import { fetchFrequentUsers, searchUsers } from './authApi';
import type { UserDiscoveryResponse } from '@/types/api';
import { normalizeUsername } from '@/utils/username';

export const USER_SEARCH_QUERY_KEY = 'user-search';
export const USER_FREQUENT_QUERY_KEY = 'user-frequent';

export const useFrequentUsers = (limit = 6) =>
  useQuery<UserDiscoveryResponse, Error>({
    queryKey: [USER_FREQUENT_QUERY_KEY, limit],
    queryFn: () => fetchFrequentUsers(limit),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

export const useUserSearch = (query: string, limit = 10) =>
  useQuery<UserDiscoveryResponse, Error>({
    queryKey: [USER_SEARCH_QUERY_KEY, query, limit],
    queryFn: () => searchUsers(query, limit),
    enabled: normalizeUsername(query).length > 0,
    staleTime: 1000 * 10,
    gcTime: 1000 * 60 * 5,
  });
