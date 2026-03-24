/**
 * @description
 * This is the root component of the Transfa application. It sets up all the
 * essential providers that wrap the entire app.
 *
 * @dependencies
 * - react: Core React library.
 * - @clerk/clerk-expo: Provides the ClerkProvider for handling authentication state.
 * - @tanstack/react-query: Provides QueryClient and QueryClientProvider for server state management.
 * - @react-navigation/native: Provides the NavigationContainer to manage the app's navigation stack.
 * - expo-secure-store: Used by Clerk for secure token storage.
 * - RootNavigator: The main navigator component that decides which screen stack to show.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  NavigationContainer,
  type NavigationContainerRef,
  type ParamListBase,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Keyboard, Linking, TouchableWithoutFeedback, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from '@expo-google-fonts/montserrat';

import ClerkProvider from '@/providers/ClerkProvider';
import RootNavigator from '@/navigation/RootNavigator';
import { useAuth } from '@/hooks/useAuth';
import { useSecurityStore } from '@/store/useSecurityStore';
import SplashScreen from '@/components/splash-screen';

const queryClient = new QueryClient();
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder_key_for_development';
const moneyDropUUIDPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseMoneyDropIdFromURL = (incomingUrl: string): string | null => {
  const normalizedURL = incomingUrl.trim();
  if (!normalizedURL) {
    return null;
  }

  try {
    const parsed = new URL(normalizedURL);
    const candidates = [
      parsed.searchParams.get('drop_id'),
      parsed.searchParams.get('money_drop_id'),
    ];

    const pathSegments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (pathSegments.length > 0) {
      candidates.push(pathSegments[pathSegments.length - 1]);
    }

    for (const candidate of candidates) {
      const cleaned = candidate?.trim() ?? '';
      if (moneyDropUUIDPattern.test(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // Ignore parsing errors and continue with regex fallback.
  }

  const queryMatch = normalizedURL.match(/[?&](?:drop_id|money_drop_id)=([0-9a-fA-F-]{36})/);
  if (queryMatch && moneyDropUUIDPattern.test(queryMatch[1])) {
    return queryMatch[1];
  }

  return null;
};

if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    '⚠️  Missing Clerk Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file for full functionality.'
  );
}

function AppRoot(): React.JSX.Element {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<ParamListBase> | null>(null);
  const pendingDropIdRef = useRef<string | null>(null);
  const previousUserRef = useRef<string | null>(null);
  const setSecurityStoreActiveUserId = useSecurityStore((state) => state.setActiveUserId);

  const activeUserId = isSignedIn && userId ? userId : null;

  const navigateToClaimDrop = useCallback(
    (dropId: string) => {
      const nav = navigationRef.current;
      if (!nav || !nav.isReady() || !isLoaded || !isSignedIn) {
        pendingDropIdRef.current = dropId;
        return;
      }

      pendingDropIdRef.current = null;
      nav.navigate('ClaimDrop', { dropId });
    },
    [isLoaded, isSignedIn]
  );

  const flushPendingDropLink = useCallback(() => {
    if (!pendingDropIdRef.current || !isLoaded || !isSignedIn) {
      return;
    }
    navigateToClaimDrop(pendingDropIdRef.current);
  }, [isLoaded, isSignedIn, navigateToClaimDrop]);

  const handleIncomingURL = useCallback(
    (url: string) => {
      const dropId = parseMoneyDropIdFromURL(url);
      if (!dropId) {
        return;
      }
      navigateToClaimDrop(dropId);
    },
    [navigateToClaimDrop]
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const previousUserId = previousUserRef.current;
    if (previousUserId !== activeUserId) {
      queryClient.cancelQueries();
      queryClient.clear();
      previousUserRef.current = activeUserId;
      if (!activeUserId) {
        pendingDropIdRef.current = null;
      }
    }

    setSecurityStoreActiveUserId(activeUserId).catch((error) => {
      console.warn('Failed to scope security state to authenticated user', error);
    });
  }, [activeUserId, isLoaded, setSecurityStoreActiveUserId]);

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          handleIncomingURL(url);
        }
      })
      .catch((error) => {
        console.warn('Failed to read initial URL:', error);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingURL(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleIncomingURL]);

  useEffect(() => {
    flushPendingDropLink();
  }, [flushPendingDropLink]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ flex: 1 }}>
              <NavigationContainer
                ref={navigationRef}
                onReady={flushPendingDropLink}
                onStateChange={flushPendingDropLink}
              >
                <RootNavigator />
              </NavigationContainer>
            </View>
          </TouchableWithoutFeedback>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function App(): React.JSX.Element | null {
  const [artificFontsLoaded, setArtificFontsLoaded] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [montserratFontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    let isMounted = true;

    const loadArtificFonts = async () => {
      try {
        await Font.loadAsync({
          'ArtificTrial-Bold': require('./src/assets/fonts/artifictrial-bold.otf'),
          'ArtificTrial-Regular': require('./src/assets/fonts/artifictrial-regular.otf'),
          'ArtificTrial-Medium': require('./src/assets/fonts/artifictrial-medium.otf'),
          'ArtificTrial-Semibold': require('./src/assets/fonts/artifictrial-semibold.otf'),
        });
      } catch (error) {
        console.warn('Font loading failed:', error);
      } finally {
        if (isMounted) {
          setArtificFontsLoaded(true);
        }
      }
    };

    loadArtificFonts();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSplashFinish = useCallback(() => {
    setIsSplashVisible(false);
  }, []);

  const isAppReady = montserratFontsLoaded && artificFontsLoaded;

  if (!isAppReady) {
    return null;
  }

  if (isSplashVisible) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <AppRoot />
    </ClerkProvider>
  );
}

export default App;
