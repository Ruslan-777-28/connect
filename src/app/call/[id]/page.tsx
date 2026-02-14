'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import type { Call } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PhoneOff } from 'lucide-react';
import { respondToCallAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function CallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();

  const callDocRef = useMemoFirebase(
    () => (id ? doc(firestore, 'calls', id) : null),
    [id, firestore]
  );

  const { data: call, isLoading: loadingCall } = useDoc<Call>(callDocRef);
  
  useEffect(() => {
    if (!call || !user) return;

    if (call.status === 'ended') {
      toast({
        title: 'Call Ended',
      });
      router.push('/');
      return;
    }
    
    if(user.uid !== call.callerUid && user.uid !== call.calleeUid) {
        toast({
            variant: 'destructive',
            title: 'Unauthorized',
            description: 'You are not a participant in this call.'
        });
        router.push('/');
        return;
    }
  }, [call, user, router, toast]);

  const handleEndCall = async () => {
    if (!id) return;
    try {
      await respondToCallAction(id, 'end');
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

  if (loadingCall || !call || !call.roomUrl) {
    return renderLoading();
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
