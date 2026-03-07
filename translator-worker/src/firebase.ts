import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { config } from './config';

const app =
  getApps()[0] ??
  initializeApp({
    credential:
      config.firebaseProjectId &&
      config.firebaseClientEmail &&
      config.firebasePrivateKey
        ? cert({
            projectId: config.firebaseProjectId,
            clientEmail: config.firebaseClientEmail,
            privateKey: config.firebasePrivateKey,
          })
        : applicationDefault(),
  });

export const adminDb = getFirestore(app);