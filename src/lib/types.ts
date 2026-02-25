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
  createdAt: Timestamp | any;
  updatedAt?: Timestamp | any;
  availability?: Availability;
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
  expiresAt?: Timestamp;
  caller?: UserProfile;
  callerActingAs?: 'client' | 'pro';
  receiverActingAs?: 'client' | 'pro';
  endReason?: string | null;
  endedBy?: string | null;
};
