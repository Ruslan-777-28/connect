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
  calleeUid: string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined';
  roomUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  caller?: UserProfile;
};
