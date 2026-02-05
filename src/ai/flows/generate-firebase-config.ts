'use server';

/**
 * @fileOverview A tool that generates Firebase configuration settings for .env.local.
 *
 * - generateFirebaseConfig - A function that generates the Firebase configuration.
 * - GenerateFirebaseConfigInput - The input type for the generateFirebaseConfig function (empty object).
 * - GenerateFirebaseConfigOutput - The return type for the generateFirebaseConfig function (string of .env.local config).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateFirebaseConfigInputSchema = z.object({});
export type GenerateFirebaseConfigInput = z.infer<typeof GenerateFirebaseConfigInputSchema>;

const GenerateFirebaseConfigOutputSchema = z.object({
  config: z.string().describe('Firebase configuration settings for .env.local.'),
});
export type GenerateFirebaseConfigOutput = z.infer<typeof GenerateFirebaseConfigOutputSchema>;

export async function generateFirebaseConfig(
  input: GenerateFirebaseConfigInput
): Promise<GenerateFirebaseConfigOutput> {
  return generateFirebaseConfigFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateFirebaseConfigPrompt',
  input: {schema: GenerateFirebaseConfigInputSchema},
  output: {schema: GenerateFirebaseConfigOutputSchema},
  prompt: `You are an expert in Firebase and Next.js. Generate the necessary .env.local configuration settings for Firebase, so I can quickly initialize Firebase in my Next.js project. Only include the keys and values, do not provide any extra explanation.

Use the NEXT_PUBLIC_ prefix for all variables. The variables should be:
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

Use placeholder values like 'your-api-key'.

Output the configuration settings in the format required by .env.local files.
`,
});

const generateFirebaseConfigFlow = ai.defineFlow(
  {
    name: 'generateFirebaseConfigFlow',
    inputSchema: GenerateFirebaseConfigInputSchema,
    outputSchema: GenerateFirebaseConfigOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
