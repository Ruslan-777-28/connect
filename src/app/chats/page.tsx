
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Video, FileText, HelpCircle, ChevronRight, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { CommunicationRequest } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function ChatsPage() {
  const [activeTab, setActiveTab] = useState('customer');
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  // Query for finished chats as customer (initiator)
  const customerQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'communicationRequests'),
      where('initiatorId', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc')
    ) : null),
    [user, firestore]
  );

  // Query for finished chats as professional (author)
  const professionalQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'communicationRequests'),
      where('authorId', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc')
    ) : null),
    [user, firestore]
  );

  const { data: customerChats, isLoading: loadingCustomer } = useCollection<CommunicationRequest>(customerQuery);
  const { data: professionalChats, isLoading: loadingProfessional } = useCollection<CommunicationRequest>(professionalQuery);

  const renderIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <FileText className="h-4 w-4" />;
      case 'text': return <HelpCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const renderChatCard = (chat: CommunicationRequest) => (
    <Card 
      key={chat.id} 
      className="mb-3 cursor-pointer hover:bg-accent/50 transition-colors border-primary/5 shadow-sm"
      onClick={() => router.push(`/wallet`)} // For now redirect to wallet for details
    >
      <CardContent className="p-4 flex items-center gap-4">
        <UserAvatar user={{ id: '', name: 'Користувач', balance: 0, createdAt: null } as any} className="h-12 w-12" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm truncate">Запит #{chat.id.slice(0, 5)}</h3>
            <span className="text-[10px] text-muted-foreground">
              {chat.completedAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1">
              {renderIcon(chat.type)}
              <span className="capitalize">{chat.type === 'text' ? 'Питання' : chat.type === 'file' ? 'Файл' : 'Відео'}</span>
            </span>
            <span>•</span>
            <span className="font-medium text-primary">{chat.reservedCoins} COIN</span>
          </div>
          <p className="text-xs text-foreground/70 truncate italic">"{chat.lastMessagePreview || 'No message preview'}"</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );

  const isLoading = loadingCustomer || loadingProfessional;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Чати</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="customer">Я замовник</TabsTrigger>
          <TabsTrigger value="professional">Я професіонал</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-250px)]">
            <TabsContent value="customer" className="mt-0">
              {customerChats && customerChats.length > 0 ? (
                customerChats.map(renderChatCard)
              ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                  У вас немає завершених чатів як замовника.
                </div>
              )}
            </TabsContent>

            <TabsContent value="professional" className="mt-0">
              {professionalChats && professionalChats.length > 0 ? (
                professionalChats.map(renderChatCard)
              ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                  Ви ще не завершили жодної консультації.
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        )}
      </Tabs>
    </div>
  );
}
