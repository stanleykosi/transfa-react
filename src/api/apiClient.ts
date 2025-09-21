/**
 * @description
 * This file configures and exports a centralized Axios instance for making
 * authenticated API requests to the Transfa backend.
 *
 * Key features:
 * - Centralized Configuration: The base URL is configured from environment variables.
 * - Automatic Authentication: An Axios interceptor is used to automatically attach the
 *   Clerk-issued JWT to the Authorization header of every request, ensuring
 *   all communication with the backend is authenticated.
 *
 * @dependencies
 * - axios: For making HTTP requests.
 * - @clerk/clerk-expo: Used to access the active user session and retrieve the JWT.
 */
import axios from 'axios';
import { Clerk } from '@clerk/clerk-expo';

// Retrieve the API Gateway URL from environment variables.
// Fallback to a local default for development.
const API_GATEWAY_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL || 'http://localhost:8080';

// Create a new Axios instance with the base URL.
const apiClient = axios.create({
  baseURL: API_GATEWAY_URL,
});

// Add a request interceptor to inject the authentication token.
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Get the current active session from Clerk.
      const session = Clerk.session;
      if (session) {
        // Retrieve the JWT for the current session.
        const token = await session.getToken();
        if (token) {
          // Add the JWT to the Authorization header.
          config.headers.Authorization = `Bearer ${token}`;
        }
        // Also pass the Clerk user id for services that expect it.
        const userId = (session as any).userId || (session as any).user?.id;
        if (userId) {
          (config.headers as any)['X-Clerk-User-Id'] = String(userId);
        }
      }
    } catch (error) {
      // Log an error if token retrieval fails, but don't block the request.
      // The backend will handle the case of a missing token.
      console.error('Failed to retrieve auth token:', error);
    }
    return config;
  },
  (error) => {
    // Forward the request error.
    return Promise.reject(error);
  }
);

export default apiClient;
