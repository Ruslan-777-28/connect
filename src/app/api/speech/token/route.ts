
import { NextResponse } from 'next/server';

/**
 * Issues a short-lived authorization token for Azure Speech SDK.
 * This prevents exposing the API key to the client side.
 */
export async function GET() {
  try {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;

    if (!key || !region) {
      return NextResponse.json({ error: 'Azure Speech credentials not configured' }, { status: 500 });
    }

    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Length': '0',
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Azure token request failed: ${res.statusText}`);
    }

    const token = await res.text();

    return NextResponse.json({
      token,
      region,
    });
  } catch (error) {
    console.error('Failed to get Azure Speech token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
