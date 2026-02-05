'use server';

import { generateFirebaseConfig } from '@/ai/flows/generate-firebase-config';

export async function generateFirebaseConfigAction() {
  try {
    const result = await generateFirebaseConfig({});
    return { success: true, data: result.config };
  } catch (error) {
    console.error(error);
    return { success: false, error: 'Failed to generate Firebase config.' };
  }
}
