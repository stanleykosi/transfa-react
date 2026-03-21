import type { AuthStackParamList } from './AuthStack';

export type AuthInitialRoute = keyof AuthStackParamList;

let nextAuthInitialRoute: AuthInitialRoute | null = null;

export const setNextAuthInitialRoute = (route: AuthInitialRoute | null) => {
  nextAuthInitialRoute = route;
};

export const consumeNextAuthInitialRoute = (): AuthInitialRoute | null => {
  const route = nextAuthInitialRoute;
  nextAuthInitialRoute = null;
  return route;
};
