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
