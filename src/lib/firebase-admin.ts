import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  // Initialize on the server
  admin.initializeApp();
}

export { admin };
