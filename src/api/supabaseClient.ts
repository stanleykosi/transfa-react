/**
 * @description
 * This file configures and exports a Supabase client instance and provides
 * helper functions for interacting with Supabase services, such as Storage.
 *
 * @dependencies
 * - @supabase/supabase-js: The official Supabase client library.
 * - @clerk/clerk-expo: For getting the JWT to authenticate Supabase requests.
 * - react-native-get-random-values: Polyfill for crypto, needed by Supabase.
 * - react-native-image-picker: For the Asset type definition.
 */
import 'react-native-get-random-values'; // Required for uuid
import { createClient } from '@supabase/supabase-js';
import { Clerk } from '@clerk/clerk-expo';
import type { Asset } from 'react-native-image-picker';

// Retrieve Supabase credentials from environment variables.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be provided in environment variables.');
}

// Initialize the Supabase client.
// We provide a custom global fetch that includes the Clerk JWT for authentication.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We're managing auth via Clerk, not Supabase Auth.
  },
  global: {
    // This function is called before every request to Supabase.
    // It retrieves the latest Clerk JWT and adds it to the Authorization header.
    // This is how we authenticate with Supabase using our Clerk user identity.
    fetch: async (url, options = {}) => {
      const clerkToken = await Clerk.session?.getToken({ template: 'supabase' });

      const headers = new Headers(options.headers);
      if (clerkToken) {
        headers.set('Authorization', `Bearer ${clerkToken}`);
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
  },
});

/**
 * Uploads an image asset to the Supabase storage bucket for payment requests.
 *
 * @param asset The image asset object from react-native-image-picker.
 * @returns A promise that resolves with the public URL of the uploaded image.
 * @throws An error if the upload fails.
 */
export const uploadImage = async (asset: Asset): Promise<string> => {
  if (!asset.uri || !asset.fileName || !asset.type) {
    throw new Error('Invalid image asset provided for upload.');
  }

  // The RLS policy on the bucket is set to allow uploads into a folder
  // named after the user's authenticated UID. We get this UID from Clerk.
  const userId = Clerk.user?.id;
  if (!userId) {
    throw new Error('User must be authenticated to upload images.');
  }

  // Create a unique file path for the image to avoid name collisions.
  const fileExt = asset.fileName.split('.').pop();
  const filePath = `${userId}/${new Date().getTime()}.${fileExt}`;

  // Use the browser's fetch API to get the blob data of the image.
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  // Upload the file to the 'payment-request-images' bucket.
  const { data, error } = await supabase.storage
    .from('payment-request-images')
    .upload(filePath, blob, {
      contentType: asset.type,
      upsert: false,
    });

  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(error.message);
  }

  // After a successful upload, get the public URL for the file.
  const { data: urlData } = supabase.storage.from('payment-request-images').getPublicUrl(data.path);

  return urlData.publicUrl;
};
