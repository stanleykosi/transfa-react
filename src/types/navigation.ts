import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoneyDropResponse, UserDiscoveryResult, UserType } from '@/types/api';

export type AuthStackParamList = {
  OnboardingWelcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  VerifyCode: {
    emailAddressId?: string;
  };
  ForgotPassword: {
    identifier?: string;
  };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  KycLevel: undefined;
  KycTier3Upgrade: undefined;
  Beneficiaries: undefined;
  LinkAccountPin: undefined;
  AddBeneficiary: undefined;
  ReceivingPreferences: undefined;
  PinSettings: undefined;
  PinOtp: undefined;
  PinCurrent: undefined;
  PinNew: undefined;
  PinVerify: undefined;
  PinChangeSuccess: undefined;
};

export type AppTabsParamList = {
  Home: undefined;
  Settings: NavigatorScreenParams<ProfileStackParamList>;
  MoneyDrop: undefined;
  Support: undefined;
};

export type AppStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabsParamList>;
  SelectAccountType: undefined;
  OnboardingForm: {
    userType?: UserType;
    startStep?: 1 | 2 | 3;
    forceTier1Update?: boolean;
  };
  CreateAccount: undefined;
  CreateUsername: undefined;
  CreatePin: undefined;
  ConfirmPin: { pin: string };
  OnboardingResult: {
    outcome: 'success' | 'failure' | 'manual_review';
    status: string;
    reason?: string;
  };
  UserSearch: undefined;
  Scan: undefined;
  PayUser:
    | {
        initialRecipient?: UserDiscoveryResult;
      }
    | undefined;
  SelfTransfer: undefined;
  TransferStatus: {
    transactionId: string;
    amount: number;
    fee: number;
    description?: string;
    recipientUsername?: string;
    transferType?: string;
    initialStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    failureReason?: string;
  };
  MultiTransferReceipts: {
    receipts: Array<{
      transactionId: string;
      amount: number;
      fee: number;
      description: string;
      recipientUsername: string;
      initialStatus?: 'completed' | 'failed';
    }>;
    failures?: Array<{
      recipient_username: string;
      amount: number;
      description: string;
      error: string;
    }>;
  };
  PaymentRequestsList: undefined;
  PaymentRequestHistory: undefined;
  CreatePaymentRequest:
    | {
        initialRecipient?: UserDiscoveryResult;
        forceMode?: 'general' | 'individual';
      }
    | undefined;
  UserProfileView: {
    user: UserDiscoveryResult;
  };
  PaymentRequestSuccess: { requestId: string };
  NotificationCenter: undefined;
  IncomingRequests: undefined;
  IncomingRequestDetail: { requestId: string; notificationId?: string };
  RequestPaymentSummary: { requestId: string };
  RequestPaymentAuth: { requestId: string };
  PaymentVerification:
    | {
        intent: 'transfer';
        transfers: Array<{
          recipientUserId?: string;
          recipientUsername: string;
          recipientFullName?: string | null;
          amount: number;
          narration: string;
          avatarIndex?: number;
          verified?: boolean;
        }>;
        fromList?: boolean;
        listName?: string;
        listEmoji?: string;
      }
    | {
        intent: 'withdraw';
        beneficiaryId: string;
        accountName: string;
        accountNumberMasked: string;
        bankName: string;
        amount: number;
      }
    | {
        intent: 'request_payment';
        requestId: string;
      };
  TransferLists: undefined;
  TransferListCreate: undefined;
  TransferListDetail: { listId: string };
  PayTransferList: { listId: string };
  CreateDropWizard: undefined;
  MoneyDropSuccess: {
    dropDetails: MoneyDropResponse;
    lockPassword?: string;
  };
  ClaimDrop: { dropId: string };
  MoneyDropDetails: { dropId: string };
  MoneyDropClaimers: { dropId: string; title?: string };
  MoneyDropClaimedHistory: undefined;
};

export type AppNavigationProp = NativeStackNavigationProp<AppStackParamList>;
