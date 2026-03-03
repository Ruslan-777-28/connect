
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

export type Message = {
  id: string;
  senderId: string;
  text?: string;
  fileUrl?: string;
  createdAt: Timestamp | any;
};

export type CommunicationRequest = {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'text' | 'file' | 'video';
  status: 'pending' | 'accepted' | 'completed' | 'declined' | 'expired' | 'ringing';
  offerId: string;
  pricingSnapshot: any;
  createdAt: Timestamp | any;
  expiresAt: Timestamp | any;
};

export type WalletLedgerEntry = {
  id: string;
  uid: string;
  type: 'topup' | 'call_payment' | 'payout';
  amount: number;
  currency: string;
  balanceAfter?: number;
  createdAt: Timestamp | any;
  status: 'posted' | 'pending' | 'failed';
  callId?: string;
  kind?: string;
  metadata?: any;
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

export type Call = CommunicationRequest & {
  roomUrl?: string;
  roomName?: string;
  billedMinutes?: number;
  billedCoins?: number;
  acceptedAtTs?: Timestamp | null;
  endedAtTs?: Timestamp | null;
};
