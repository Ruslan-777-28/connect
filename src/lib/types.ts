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
  callerId: string;
  receiverId: string;
  callerName?: string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed' | 'expired';
  roomUrl: string;
  roomName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  acceptedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  caller?: UserProfile;
  callerActingAs?: 'client' | 'pro';
  receiverActingAs?: 'client' | 'pro';
  endReason?: string | null;
  endedBy?: string | null;
};
