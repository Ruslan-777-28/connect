import type { Timestamp } from 'firebase/firestore';
import type { 
  TranslationParticipantState, 
  CallTranslationDoc, 
  TranslationSegmentDoc,
  TranslationMode,
  TranslationStatus,
  TranslationBotStatus
} from './translation/types';

export type { 
  TranslationParticipantState as TranslationParticipant, 
  CallTranslationDoc as CallTranslation, 
  TranslationSegmentDoc as TranslationSegment,
  TranslationMode,
  TranslationStatus,
  TranslationBotStatus
};

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
  held: number;
  currency?: 'COIN' | string;
  createdAt: Timestamp | any;
  updatedAt?: Timestamp | any;
  balanceUpdatedAt?: Timestamp | any;
  availability?: Availability;
};

export type MessageKind = 'question' | 'answer' | 'file' | 'system';

export type Message = {
  id: string;
  senderId: string;
  kind: MessageKind;
  text?: string;
  fileMeta?: any;
  createdAt: Timestamp | any;
};

export type CommunicationRequest = {
  id: string;
  initiatorId: string;
  authorId: string;
  payerId: string;
  payeeId: string;
  type: 'video' | 'text' | 'file' | 'product';
  status: 'pending' | 'accepted' | 'answered' | 'completed' | 'declined' | 'expired' | 'ringing';
  offerId?: string;
  productId?: string;
  pricingSnapshot: any;
  reservedCoins: number;
  holdId: string;
  createdAt: Timestamp | any;
  expiresAt: Timestamp | any;
  answeredAt?: Timestamp | any;
  completedAt?: Timestamp | any;
  lastMessageAt: Timestamp | any;
  lastMessagePreview?: string;
  fileMeta?: any;
  // Scheduled call specific fields
  scheduledStart?: Timestamp | any;
  scheduledEnd?: Timestamp | any;
};

export type DigitalProduct = {
  id: string;
  authorId: string;
  categoryId: string;
  subcategoryId: string;
  title: string;
  description: string;
  imageUrl?: string;
  deliveryImageUrl?: string;
  deliveryText: string;
  price: number;
  createdAt: Timestamp | any;
};

export type Notification = {
  id: string;
  uid: string;
  channel: 'system' | 'user';
  kind: string;
  requestId?: string;
  title: string;
  body: string;
  createdAt: Timestamp | any;
  readAt: Timestamp | any | null;
};

export type WalletHold = {
  id: string;
  uid: string;
  amount: number;
  currency: string;
  status: 'held' | 'captured' | 'released';
  refType: string;
  refId: string;
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
  ratePerSession?: number;
  currency: string;
};

export type SchedulingType = 'instant' | 'scheduled';

export type CommunicationOffer = {
  id: string;
  ownerId: string;
  type: 'video' | 'file' | 'text';
  schedulingType: SchedulingType;
  scheduledStart?: Timestamp | any;
  scheduledEnd?: Timestamp | any;
  durationMinutes?: number;
  categoryId: string;
  subcategoryId: string;
  pricing: Pricing;
  status: 'active' | 'inactive' | 'booked';
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
  caller?: UserProfile;
};

export type Post = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  imageUrl?: string;
  viewCount: number;
  createdAt: Timestamp | any;
  updatedAt?: Timestamp | any;
};

export type Comment = {
  id: string;
  uid: string;
  text: string;
  createdAt: Timestamp | any;
};

export type FavoriteType = 'user' | 'post' | 'product';

export type Favorite = {
  id: string;
  uid: string;
  targetId: string;
  type: FavoriteType;
  createdAt: Timestamp | any;
};

export type LikeType = 'post' | 'product';

export type Like = {
  id: string;
  uid: string;
  targetId: string;
  type: LikeType;
  createdAt: Timestamp | any;
};
