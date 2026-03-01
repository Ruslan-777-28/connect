
import type { Timestamp } from 'firebase/firestore';

export type Availability = {
  status: 'online' | 'offline';
  until?: Timestamp;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  balance: number;
  currency?: 'COIN' | string;
  createdAt: Timestamp | any;
  updatedAt?: Timestamp | any;
  balanceUpdatedAt?: Timestamp | any;
  availability?: Availability;
};

export type WalletLedgerEntry = {
  id: string;
  uid: string;
  type: 'topup' | 'call_payment' | 'payout';
  amount: number;
  currency: string;
  balanceAfter: number;
  createdAt: Timestamp | any;
  status: 'posted' | 'pending' | 'failed';
  metadata?: {
    callId?: string;
    description?: string;
  };
};

export type PricingSnapshot = {
  type: 'video' | 'file' | 'text';
  categoryId: string;
  subcategoryId: string;
  currency: 'COIN' | string;
  ratePerMinute?: number | null;
  ratePerFile?: number | null;
  ratePerQuestion?: number | null;
  capturedAt: Timestamp | any;
};

export type Call = {
  id: string;
  callerId: string;
  receiverId: string;
  callerName?: string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed' | 'expired';
  roomUrl: string;
  roomName: string;
  createdAt: Timestamp;
  createdAtTs?: Timestamp;
  updatedAt: Timestamp;
  acceptedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  expiresAt?: Timestamp;
  caller?: UserProfile;
  callerActingAs?: 'client' | 'pro';
  receiverActingAs?: 'client' | 'pro';
  endReason?: string | null;
  endedBy?: string | null;
  offerId?: string;
  pricingSnapshot?: PricingSnapshot;
};

export type Pricing = {
  ratePerMinute?: number;
  ratePerFile?: number;
  ratePerQuestion?: number;
  currency: string;
};

export type CommunicationOffer = {
  id: string;
  ownerId: string;
  type: 'video' | 'file' | 'text';
  categoryId: string;
  subcategoryId: string;
  pricing: Pricing;
  status: 'active' | 'inactive';
  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
};
