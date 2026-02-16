'use client';

import { useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function CallRedirectPage({ params }: { params: { id: string } }) {
  useEffect(() => {
    const callId = params.id;

    const token = sessionStorage.getItem(`dailyToken:${callId}`);
    const roomUrl = sessionStorage.getItem(`dailyRoomUrl:${callId}`);

    if (!token || !roomUrl) {
      // For the receiver, IncomingCallManager will run, call 'acceptCall',
      // set the token in sessionStorage, and then open this page.
      // We show a loading state until the token is available.
      // If the caller arrives here and has no token, something went wrong in startVideoCall.
      return;
    }

    const url = new URL(roomUrl);
    url.searchParams.set('t', token);

    // Redirect the user to the Daily call URL with the meeting token
    window.location.href = url.toString();
  }, [params.id]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
       <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connecting to Call</CardTitle>
          <CardDescription>Please wait while we redirect you to the call room.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center pt-4">
            <div className="animate-pulse flex space-x-2">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
                <div className="w-3 h-3 bg-primary rounded-full animation-delay-200"></div>
                <div className="w-3 h-3 bg-primary rounded-full animation-delay-400"></div>
            </div>
        </CardContent>
       </Card>
    </div>
  );
}
