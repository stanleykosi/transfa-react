import { Platform } from 'react-native';
import { SignIn as SignInReact, SignUp as SignUpReact } from '@clerk/clerk-react';

const NativeClerkComponent = () => null;

export const SignIn = Platform.OS === 'web' ? SignInReact : NativeClerkComponent;
export const SignUp = Platform.OS === 'web' ? SignUpReact : NativeClerkComponent;
