'use client';

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';

export default function DebugDailyPage() {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useUser();
  const app = useFirebaseApp();

  const handleCreateRoom = async () => {
    if (!user) {
      setError('You must be logged in to create a room.');
      return;
    }
    setLoading(true);
    setError(null);
    setRoomUrl(null);
    try {
      const functions = getFunctions(app);
      const createDailyRoom = httpsCallable(functions, 'createDailyRoom');

      const result: any = await createDailyRoom();
      console.log(result.data);


      if (result.data?.roomUrl) {
        setRoomUrl(result.data.roomUrl);
      } else {
        setError(result.data?.error || 'No roomUrl returned from function.');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Debug Daily.co Integration</CardTitle>
          <CardDescription>
            Use this page to test the creation of a Daily.co video call room.
            The result will be logged to the console and displayed below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCreateRoom} disabled={loading || !user}>
            {loading ? 'Creating Room...' : 'Create Daily Room'}
          </Button>

          {!user && (
            <p className="text-sm text-yellow-600">
              Please log in to create a room.
            </p>
          )}

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          {roomUrl && (
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                Room Created Successfully:
              </p>
              <div className="rounded-md border bg-muted p-3">
                <Link
                  href={roomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm text-primary hover:underline"
                >
                  {roomUrl}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
