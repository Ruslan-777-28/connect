import type { Timestamp } from 'firebase/firestore';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: Timestamp | any;
  updatedAt?: Timestamp | any;
};

export type Call = {
  id: string;
  callerUid: string;
  receiverUid: string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed' | 'expired';
  roomUrl?: string;
  roomName?: string;
  type: 'video';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  acceptedAt: Timestamp | null;
  endedAt: Timestamp | null;
  caller?: UserProfile;
  callerActingAs?: 'client' | 'pro';
  receiverActingAs?: 'client' | 'pro';
};
