import type { Timestamp } from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: Timestamp;
};
