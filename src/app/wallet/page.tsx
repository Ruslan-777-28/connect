'use client';

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile } from '@/lib/types';
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

interface DemoItem {
  id: string;
  type: 'video' | 'file' | 'text';
  userName: string;
  userAvatar: string;
  reward: string;
  date: string;
}

const demoData: Record<TabType, DemoItem[]> = {
  i_owe: [
    { id: '1', type: 'video', userName: 'Олександр В.', userAvatar: 'https://picsum.photos/seed/1/200', reward: '50 COIN', date: '24.05.2024' },
    { id: '2', type: 'text', userName: 'Марія К.', userAvatar: 'https://picsum.photos/seed/2/200', reward: '20 COIN', date: '23.05.2024' },
  ],
  pending: [
    { id: '3', type: 'file', userName: 'Іван Д.', userAvatar: 'https://picsum.photos/seed/3/200', reward: '100 COIN', date: '25.05.2024' },
    { id: '4', type: 'video', userName: 'Олена С.', userAvatar: 'https://picsum.photos/seed/4/200', reward: '30 COIN', date: '25.05.2024' },
    { id: '5', type: 'text', userName: 'Петро Р.', userAvatar: 'https://picsum.photos/seed/5/200', reward: '15 COIN', date: '24.05.2024' },
  ],
  owed_to_me: [
    { id: '6', type: 'video', userName: 'Анна М.', userAvatar: 'https://picsum.photos/seed/6/200', reward: '45 COIN', date: '22.05.2024' },
  ],
};

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

  const handleTopUp = async () => {
    if (!user) return;
    setIsTopUpLoading(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const devTopUp = httpsCallable(functions, 'devTopUp');
      const result: any = await devTopUp({ amount: 100 });
      
      if (result.data?.ok) {
        toast({
          title: 'Успіх!',
          description: 'Ваш баланс поповнено на 100 COIN.',
        });
      }
    } catch (error: any) {
      console.error('Top-up error:', error);
      toast({
        variant: 'destructive',
        title: 'Помилка',
        description: error.message || 'Не вдалося поповнити баланс.',
      });
    } finally {
      setIsTopUpLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="container mx-auto max-w-2xl p-4 py-8">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const balance = profile?.balance ?? 0;
  const currency = profile?.currency || 'COIN';

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
            <span className="text-sm font-medium opacity-80 uppercase tracking-wider">Баланс</span>
            <Wallet className="h-5 w-5 opacity-80" />
          </div>
          <CardTitle className="text-4xl font-extrabold flex items-baseline gap-2">
            {balance.toFixed(0)} 
            <span className="text-xl font-medium opacity-80">{currency}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-2">
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto"
              onClick={handleTopUp}
              disabled={isTopUpLoading}
            >
              {isTopUpLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownLeft className="h-4 w-4" />
              )}
              <span className="text-[10px] uppercase font-bold text-center">Поповнити</span>
            </Button>

            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto"
              onClick={() => router.push('/wallet/transactions')}
            >
              <History className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold text-center">Транзакції</span>
            </Button>
            
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto opacity-50 cursor-not-allowed"
              disabled
            >
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold text-center">Вивести</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-primary/10 shadow-sm overflow-hidden">
          <CardContent className="p-4 grid grid-cols-3 gap-2">
            <Button 
              variant={activeTab === 'i_owe' ? 'default' : 'outline'}
              className={cn(
                "flex flex-col items-center gap-1 h-auto py-4 border-dashed",
                activeTab === 'i_owe' && "border-solid"
              )}
              onClick={() => setActiveTab('i_owe')}
            >
              <ArrowUpRight className={cn("h-4 w-4", activeTab === 'i_owe' ? "text-white" : "text-destructive")} />
              <span className="text-[10px] uppercase font-bold text-center">Я винен</span>
            </Button>

            <Button 
              variant={activeTab === 'pending' ? 'default' : 'outline'}
              className={cn(
                "flex flex-col items-center gap-1 h-auto py-4 border-dashed",
                activeTab === 'pending' && "border-solid"
              )}
              onClick={() => setActiveTab('pending')}
            >
              <Clock className={cn("h-4 w-4", activeTab === 'pending' ? "text-white" : "text-primary")} />
              <span className="text-[10px] uppercase font-bold text-center">На розгляді</span>
            </Button>

            <Button 
              variant={activeTab === 'owed_to_me' ? 'default' : 'outline'}
              className={cn(
                "flex flex-col items-center gap-1 h-auto py-4 border-dashed",
                activeTab === 'owed_to_me' && "border-solid"
              )}
              onClick={() => setActiveTab('owed_to_me')}
            >
              <ArrowDownLeft className={cn("h-4 w-4", activeTab === 'owed_to_me' ? "text-white" : "text-green-600")} />
              <span className="text-[10px] uppercase font-bold text-center">Мені винні</span>
            </Button>
          </CardContent>
        </Card>

        <ScrollArea className="h-[400px] w-full rounded-xl border border-primary/5 bg-muted/20 p-4">
          <div className="space-y-4">
            {demoData[activeTab].map((item) => (
              <Card key={item.id} className="border-none shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar 
                      user={{ id: '', name: item.userName, avatarUrl: item.userAvatar, balance: 0, createdAt: null } as any} 
                      className="h-10 w-10" 
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{item.userName}</span>
                        <div className="text-muted-foreground opacity-70">
                          {renderIcon(item.type)}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{item.date}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary">{item.reward}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Винагорода</div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {demoData[activeTab].length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Немає активних записів у цій категорії
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
