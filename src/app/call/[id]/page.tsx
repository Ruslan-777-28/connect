'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useFirebaseApp, useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import type { Call } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function CallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();
  const app = useFirebaseApp();

  const callDocRef = useMemoFirebase(
    () => (id ? doc(firestore, 'calls', id) : null),
    [id, firestore]
  );

  const { data: call, isLoading: loadingCall } = useDoc<Call>(callDocRef);
  
  useEffect(() => {
    if (!call || !user) return;

    if (call.status === 'ended' || call.status === 'declined' || call.status === 'expired') {
      toast({
        title: 'Call Ended',
        description: 'You are being redirected to the home page.'
      });
      router.push('/');
      return;
    }
    
    if(user.uid !== call.callerUid && user.uid !== call.receiverUid) {
        toast({
            variant: 'destructive',
            title: 'Unauthorized',
            description: 'You are not a participant in this call.'
        });
        router.push('/');
        return;
    }

    if (call.status === 'ringing' && user.uid === call.callerUid) {
      // Caller is waiting for receiver to accept
      // The UI shows a waiting screen, no extra action needed here
    } else if (call.status === 'ringing' && user.uid === call.receiverUid) {
      // This page shouldn't be loaded for receiver while call is ringing
      // They should see the IncomingCallToast
      toast({
        title: 'Call ringing',
        description: 'Accept the call to join.'
      })
      router.push('/');
    }

  }, [call, user, router, toast]);

  const handleEndCall = async () => {
    if (!id) return;
    try {
      const functions = getFunctions(app, 'us-central1');
      const endCall = httpsCallable(functions, 'endCall');
      await endCall({ callId: id });
      // The useEffect will handle the redirection once the call status updates
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Could not end call.',
      });
    }
  };

  const renderLoading = () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
      <Card>
        <CardHeader>
            <CardTitle>Connecting Call...</CardTitle>
            <CardDescription>Please wait while we set up the call room.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
            <Skeleton className="h-[480px] w-[800px] rounded-md" />
        </CardContent>
      </Card>
    </div>
  );

  const renderWaiting = () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
            <CardTitle>Calling...</CardTitle>
            <CardDescription>Waiting for the other party to accept the call.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4">
            <div className="animate-pulse flex space-x-2">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
                <div className="w-3 h-3 bg-primary rounded-full animation-delay-200"></div>
                <div className="w-3 h-3 bg-primary rounded-full animation-delay-400"></div>
            </div>
             <Button
                variant="destructive"
                onClick={handleEndCall}
                className="mt-4"
              >
                <PhoneOff className="mr-2 h-5 w-5" />
                Cancel Call
            </Button>
        </CardContent>
      </Card>
    </div>
  )

  if (loadingCall || !call) {
    return renderLoading();
  }

  if (call.status === 'ringing' && user?.uid === call.callerUid) {
    return renderWaiting();
  }

  if (call.status !== 'accepted' || !call.roomUrl) {
    return renderLoading(); // Or a specific error/state page
  }

  return (
    <div className="relative h-screen w-screen bg-black">
      <iframe
        src={call.roomUrl}
        title="Video Call"
        allow="camera; microphone; fullscreen; speaker; display-capture"
        className="h-full w-full border-0"
      />
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
        <Button
          variant="destructive"
          size="lg"
          onClick={handleEndCall}
          className="rounded-full shadow-lg"
        >
          <PhoneOff className="mr-2 h-5 w-5" />
          End Call
        </Button>
      </div>
    </div>
  );
}
