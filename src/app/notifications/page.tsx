'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Info, UserPlus, ArrowRight, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Notification } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('system');
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const router = useRouter();

  const systemQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'notifications'),
      where('uid', '==', user.uid),
      where('channel', '==', 'system'),
      orderBy('createdAt', 'desc')
    ) : null),
    [user?.uid, firestore]
  );

  const userQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'notifications'),
      where('uid', '==', user.uid),
      where('channel', '==', 'user'),
      orderBy('createdAt', 'desc')
    ) : null),
    [user?.uid, firestore]
  );

  const { data: systemNotifs, isLoading: loadingSystem } = useCollection<Notification>(systemQuery);
  const { data: userNotifs, isLoading: loadingUser } = useCollection<Notification>(userQuery);

  const handleNotificationClick = async (notif: Notification) => {
    // Mark as read
    if (!notif.readAt) {
      try {
        const functions = getFunctions(app, 'us-central1');
        const markRead = httpsCallable(functions, 'markNotificationRead');
        markRead({ notificationId: notif.id });
      } catch (e) {}
    }

    // Navigate
    if (notif.kind === 'request_completed') {
      router.push('/chats');
    } else {
      router.push('/wallet');
    }
  };

  const renderNotification = (notif: Notification) => (
    <Card 
      key={notif.id} 
      className={cn(
        "mb-3 transition-all border-primary/5",
        !notif.readAt ? "bg-primary/5 border-primary/20" : "opacity-80",
        "cursor-pointer hover:bg-accent"
      )}
      onClick={() => handleNotificationClick(notif)}
    >
      <CardContent className="p-4 flex items-start gap-4">
        <div className={cn(
          "p-2 rounded-full",
          notif.channel === 'user' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
        )}>
          {notif.channel === 'user' ? <UserPlus className="h-5 w-5" /> : <Info className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm">{notif.title}</h3>
            {!notif.readAt && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{notif.body}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/70 uppercase font-medium">
              {notif.createdAt?.toDate?.()?.toLocaleString() || 'Recently'}
            </span>
            <span className="text-[10px] text-primary font-bold flex items-center gap-1">
              ПЕРЕЙТИ <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const isLoading = loadingSystem || loadingUser;
  const unreadCount = (userNotifs?.filter(n => !n.readAt).length || 0) + (systemNotifs?.filter(n => !n.readAt).length || 0);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Сповіщення</h1>
        {unreadCount > 0 && (
          <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full font-bold">
            {unreadCount} НОВИХ
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="system">Системні</TabsTrigger>
          <TabsTrigger value="users">Користувачів</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-250px)]">
            <TabsContent value="system" className="mt-0">
              {systemNotifs && systemNotifs.length > 0 ? (
                systemNotifs.map(renderNotification)
              ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                  У вас немає системних сповіщень.
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="mt-0">
              {userNotifs && userNotifs.length > 0 ? (
                userNotifs.map(renderNotification)
              ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                  Запити від інших користувачів відсутні.
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        )}
      </Tabs>
    </div>
  );
}
