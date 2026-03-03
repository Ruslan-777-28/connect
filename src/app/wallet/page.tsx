
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile, CommunicationRequest } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, Loader2, Clock, Video, FileText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

type TabType = 'i_owe' | 'pending' | 'owed_to_me';

export default function WalletPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const router = useRouter();
  const { toast } = useToast();

  const [isTopUpLoading, setIsTopUpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  // Fetch real requests for current user
  const authorRequestsQuery = useMemoFirebase(
    () => (user ? query(collection(firestore, 'communicationRequests'), where('authorId', '==', user.uid), orderBy('lastMessageAt', 'desc')) : null),
    [user, firestore]
  );
  const initiatorRequestsQuery = useMemoFirebase(
    () => (user ? query(collection(firestore, 'communicationRequests'), where('initiatorId', '==', user.uid), orderBy('lastMessageAt', 'desc')) : null),
    [user, firestore]
  );

  const { data: authorRequests } = useCollection<CommunicationRequest>(authorRequestsQuery);
  const { data: initiatorRequests } = useCollection<CommunicationRequest>(initiatorRequestsQuery);

  const filteredRequests = useMemo(() => {
    if (activeTab === 'i_owe') {
      // I am author, need to answer
      return (authorRequests || []).filter(r => r.status === 'pending');
    }
    if (activeTab === 'owed_to_me') {
      // I am initiator, waiting for answer
      return (initiatorRequests || []).filter(r => r.status === 'pending');
    }
    if (activeTab === 'pending') {
      // Requests in review (answered but not completed)
      return [
        ...(authorRequests || []).filter(r => r.status === 'answered'),
        ...(initiatorRequests || []).filter(r => r.status === 'answered')
      ].sort((a, b) => b.lastMessageAt?.toMillis() - a.lastMessageAt?.toMillis());
    }
    return [];
  }, [activeTab, authorRequests, initiatorRequests]);

  const handleTopUp = async () => {
    if (!user) return;
    setIsTopUpLoading(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const devTopUp = httpsCallable(functions, 'devTopUp');
      await devTopUp({ amount: 100 });
      toast({ title: 'Успіх!', description: 'Ваш баланс поповнено на 100 COIN.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: error.message || 'Не вдалося поповнити баланс.' });
    } finally {
      setIsTopUpLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="container mx-auto max-w-2xl p-4 py-8">
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const balance = profile?.balance ?? 0;
  const held = profile?.held ?? 0;
  const available = balance - held;

  const renderIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <FileText className="h-4 w-4" />;
      case 'text': return <HelpCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 pb-24">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Aktive
      </h1>

      <Card className="bg-primary text-primary-foreground overflow-hidden border-none shadow-xl mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-80 uppercase tracking-wider">Доступно</span>
            <Wallet className="h-5 w-5 opacity-80" />
          </div>
          <CardTitle className="text-4xl font-extrabold flex items-baseline gap-2">
            {available.toFixed(0)} 
            <span className="text-xl font-medium opacity-80">COIN</span>
          </CardTitle>
          <div className="text-[11px] opacity-70 flex justify-between mt-1">
             <span>Загалом: {balance.toFixed(0)}</span>
             <span>Заморожено: {held.toFixed(0)}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto" onClick={handleTopUp} disabled={isTopUpLoading}>
              {isTopUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownLeft className="h-4 w-4" />}
              <span className="text-[10px] uppercase font-bold">Поповнити</span>
            </Button>
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto" onClick={() => router.push('/wallet/transactions')}>
              <History className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold">Транзакції</span>
            </Button>
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto opacity-50 cursor-not-allowed" disabled>
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold">Вивести</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-primary/10 shadow-sm overflow-hidden">
          <CardContent className="p-4 grid grid-cols-3 gap-2">
            <Button variant={activeTab === 'i_owe' ? 'default' : 'outline'} className={cn("flex flex-col items-center gap-1 h-auto py-4 border-dashed", activeTab === 'i_owe' && "border-solid")} onClick={() => setActiveTab('i_owe')}>
              <ArrowUpRight className={cn("h-4 w-4", activeTab === 'i_owe' ? "text-white" : "text-destructive")} />
              <span className="text-[10px] uppercase font-bold">Я винен</span>
            </Button>
            <Button variant={activeTab === 'pending' ? 'default' : 'outline'} className={cn("flex flex-col items-center gap-1 h-auto py-4 border-dashed", activeTab === 'pending' && "border-solid")} onClick={() => setActiveTab('pending')}>
              <Clock className={cn("h-4 w-4", activeTab === 'pending' ? "text-white" : "text-primary")} />
              <span className="text-[10px] uppercase font-bold text-center">На розгляді</span>
            </Button>
            <Button variant={activeTab === 'owed_to_me' ? 'default' : 'outline'} className={cn("flex flex-col items-center gap-1 h-auto py-4 border-dashed", activeTab === 'owed_to_me' && "border-solid")} onClick={() => setActiveTab('owed_to_me')}>
              <ArrowDownLeft className={cn("h-4 w-4", activeTab === 'owed_to_me' ? "text-white" : "text-green-600")} />
              <span className="text-[10px] uppercase font-bold">Мені винні</span>
            </Button>
          </CardContent>
        </Card>

        <ScrollArea className="h-[450px] w-full rounded-xl border border-primary/5 bg-muted/20 p-4">
          <div className="space-y-4">
            {filteredRequests.map((item) => (
              <Card key={item.id} className="border-none shadow-sm overflow-hidden">
                <CardContent className="p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ id: '', name: 'Користувач', balance: 0, createdAt: null } as any} className="h-10 w-10" />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Запит #{item.id.slice(0, 5)}</span>
                          <div className="text-muted-foreground opacity-70">{renderIcon(item.type)}</div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{item.createdAt?.toDate()?.toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="text-sm font-bold text-primary">{item.reservedCoins} COIN</div>
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-tight">Винагорода</div>
                      <div className="text-[8px] text-muted-foreground italic opacity-70">(зарезервована)</div>
                    </div>
                  </div>

                  {activeTab === 'pending' && item.status === 'answered' && (
                    <div className="flex items-center gap-1 pt-1">
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white h-8 text-[11px] rounded-lg font-bold">Прийняти</Button>
                      <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white h-8 text-[11px] rounded-lg font-bold">Деталі</Button>
                      <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white h-8 text-[11px] rounded-lg font-bold">Відхилити</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {filteredRequests.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Немає активних записів у цій категорії</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
