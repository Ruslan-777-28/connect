
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile, CommunicationRequest, Message } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, Loader2, Clock, Video, FileText, HelpCircle, User, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { startVideoCall } from '@/lib/calls';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';

type TabType = 'i_owe' | 'pending' | 'owed_to_me';

export default function WalletPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const router = useRouter();
  const { toast } = useToast();

  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Modals state
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000); // update every 30s
    return () => clearInterval(timer);
  }, []);

  const userDocRef = useMemoFirebase(
    () => (user?.uid ? doc(firestore, 'users', user.uid) : null),
    [user?.uid, firestore]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const authorReqQuery = useMemoFirebase(() => 
    user?.uid ? query(collection(firestore, 'communicationRequests'), where('authorId', '==', user.uid), orderBy('lastMessageAt', 'desc')) : null,
  [user?.uid, firestore]);
  const initReqQuery = useMemoFirebase(() => 
    user?.uid ? query(collection(firestore, 'communicationRequests'), where('initiatorId', '==', user.uid), orderBy('lastMessageAt', 'desc')) : null,
  [user?.uid, firestore]);

  const { data: authorRequests } = useCollection<CommunicationRequest>(authorReqQuery);
  const { data: initiatorRequests } = useCollection<CommunicationRequest>(initReqQuery);

  const filteredRequests = useMemo(() => {
    if (activeTab === 'pending') {
      const proPending = (authorRequests || []).filter(r => r.status === 'pending');
      const userPending = (initiatorRequests || []).filter(r => r.status === 'pending');
      return [...proPending, ...userPending].sort((a,b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    }
    if (activeTab === 'i_owe') {
      return (authorRequests || []).filter(r => r.status === 'accepted');
    }
    if (activeTab === 'owed_to_me') {
      return (initiatorRequests || []).filter(r => r.status === 'accepted' || r.status === 'answered');
    }
    return [];
  }, [activeTab, authorRequests, initiatorRequests]);

  const handleAction = async (action: string, requestId: string, data?: any) => {
    setIsActionLoading(requestId);
    try {
      const functions = getFunctions(app, 'us-central1');
      const callable = httpsCallable(functions, action);
      await callable({ requestId, ...data });
      toast({ title: 'Успішно', description: 'Дію виконано.' });
      
      setIsAnswerModalOpen(false);
      setIsConfirmModalOpen(false);
      setIsDetailsModalOpen(false);
      setAnswerText('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCall = async (request: CommunicationRequest) => {
    if (!user || !request.offerId) return;
    setIsActionLoading(request.id);
    try {
      const receiverId = (user.uid === request.initiatorId) ? request.authorId : request.initiatorId;
      const { callId } = await startVideoCall(app, receiverId, request.offerId);
      router.push(`/call/${callId}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsActionLoading(null);
    }
  };

  const isCallTime = (req: CommunicationRequest) => {
    if (!req.scheduledStart || !req.scheduledEnd) return true; // Online calls are always ok
    
    const start = req.scheduledStart.toMillis() - 5 * 60000; // 5 mins before
    const end = req.scheduledEnd.toMillis();
    return currentTime >= start && currentTime <= end;
  };

  const getCallTimeLabel = (req: CommunicationRequest) => {
    if (!req.scheduledStart) return null;
    const start = req.scheduledStart.toDate();
    return start.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <FileText className="h-4 w-4" />;
      case 'text': return <HelpCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  if (isProfileLoading) return <div className="container mx-auto p-4"><Skeleton className="h-48 w-full" /></div>;

  const available = (profile?.balance ?? 0) - (profile?.held ?? 0);

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 pb-24">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Aktive</h1>

      <Card className="bg-primary text-primary-foreground border-none shadow-xl mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-80 uppercase">Доступно</span>
            <Wallet className="h-5 w-5 opacity-80" />
          </div>
          <CardTitle className="text-4xl font-extrabold">{available.toFixed(0)} COIN</CardTitle>
          <div className="text-[11px] opacity-70 mt-1">Заморожено: {profile?.held?.toFixed(0) ?? 0} COIN</div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 border-none text-white h-auto py-4" onClick={() => router.push('/wallet/transactions')}>
              <History className="mr-2 h-4 w-4" /> Транзакції
            </Button>
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 border-none text-white h-auto py-4 opacity-50" disabled>
              <ArrowUpRight className="mr-2 h-4 w-4" /> Вивести
            </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
            <Button variant={activeTab === 'i_owe' ? 'default' : 'outline'} className="flex flex-col gap-1 h-auto py-4" onClick={() => setActiveTab('i_owe')}>
              <ArrowUpRight className="h-4 w-4 text-destructive" />
              <span className="text-[10px] uppercase font-bold">Я винен</span>
            </Button>
            <Button variant={activeTab === 'pending' ? 'default' : 'outline'} className="flex flex-col gap-1 h-auto py-4" onClick={() => setActiveTab('pending')}>
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-[10px] uppercase font-bold">На розгляді</span>
            </Button>
            <Button variant={activeTab === 'owed_to_me' ? 'default' : 'outline'} className="flex flex-col gap-1 h-auto py-4" onClick={() => setActiveTab('owed_to_me')}>
              <ArrowDownLeft className="h-4 w-4 text-green-600" />
              <span className="text-[10px] uppercase font-bold">Мені винні</span>
            </Button>
        </div>

        <ScrollArea className="h-[450px] w-full rounded-xl border p-4 bg-muted/20">
          <div className="space-y-4">
            {filteredRequests.map((item) => (
              <Card key={item.id} className="border-none shadow-sm">
                <CardContent className="p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ name: 'User' } as any} className="h-10 w-10" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">#{item.id.slice(0, 5)}</span>
                          {renderIcon(item.type)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{item.createdAt?.toDate()?.toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">{item.reservedCoins} COIN</div>
                      <div className="text-[8px] text-muted-foreground italic">(зарезервована)</div>
                    </div>
                  </div>

                  {item.scheduledStart && (
                    <div className="text-[10px] bg-primary/5 p-2 rounded flex items-center gap-2 text-primary font-bold">
                      <Clock className="h-3 w-3" />
                      ЧАС СЕАНСУ: {getCallTimeLabel(item)}
                    </div>
                  )}

                  <div className="flex gap-1 flex-col sm:flex-row">
                    {item.type === 'video' && item.status === 'accepted' && (
                      <div className="flex flex-col flex-1 gap-1">
                        <Button 
                          size="sm" 
                          className={cn("flex-1 h-8 text-[11px]", isCallTime(item) ? "bg-primary" : "bg-muted text-muted-foreground")} 
                          onClick={() => handleCall(item)} 
                          disabled={isActionLoading === item.id || !isCallTime(item)}
                        >
                          {isActionLoading === item.id ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                          Виклик
                        </Button>
                        {!isCallTime(item) && item.scheduledStart && (
                          <p className="text-[8px] text-center text-muted-foreground">Доступно тільки в час запису</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'pending' && item.authorId === user?.uid && (
                      <div className="flex gap-1 flex-1">
                        <Button size="sm" className="flex-1 bg-green-600 h-8 text-[11px]" onClick={() => handleAction('acceptCommunicationRequest', item.id)} disabled={isActionLoading === item.id}>Прийняти</Button>
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px]" onClick={() => { setSelectedRequestId(item.id); setIsDetailsModalOpen(true); }}>Деталі</Button>
                        <Button size="sm" variant="destructive" className="flex-1 h-8 text-[11px]" onClick={() => handleAction('declineCommunicationRequest', item.id)} disabled={isActionLoading === item.id}>Відхилити</Button>
                      </div>
                    )}
                    
                    {activeTab === 'i_owe' && item.type !== 'video' && (
                      <Button size="sm" className="w-full h-8 text-[11px]" onClick={() => { setSelectedRequestId(item.id); setIsAnswerModalOpen(true); }}>Відповісти</Button>
                    )}

                    {activeTab === 'owed_to_me' && (item.status === 'answered' || (item.type === 'video' && item.status === 'accepted')) && (
                      <Button size="sm" className="w-full bg-green-600 h-8 text-[11px]" onClick={() => { setSelectedRequestId(item.id); setIsConfirmModalOpen(true); }}>
                        {item.type === 'video' ? 'Завершити та Оплатити' : 'Підтвердити та Оплатити'}
                      </Button>
                    )}
                    
                    {activeTab === 'pending' && item.initiatorId === user?.uid && (
                      <span className="text-xs text-muted-foreground italic w-full text-center py-2">Очікуємо прийняття професіоналом...</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredRequests.length === 0 && <div className="text-center py-12 text-sm text-muted-foreground">Немає активних записів</div>}
          </div>
        </ScrollArea>
      </div>

      {/* Answer Modal */}
      <Dialog open={isAnswerModalOpen} onOpenChange={setIsAnswerModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Надати відповідь</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="p-3 bg-muted rounded-md text-sm italic">
                {authorRequests?.find(r => r.id === selectedRequestId)?.lastMessagePreview}...
             </div>
             <Textarea placeholder="Ваша відповідь..." value={answerText} onChange={e => setAnswerText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={() => selectedRequestId && handleAction('postAnswer', selectedRequestId, { answerText })} disabled={!answerText || !!isActionLoading}>
              {isActionLoading ? <Loader2 className="animate-spin" /> : 'Відповісти'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Modal */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Підтвердження оплати</DialogTitle></DialogHeader>
          <p className="py-4 text-sm">Сума винагороди буде переведена на баланс виконавця. Продовжити?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmModalOpen(false)}>Скасувати</Button>
            <Button className="bg-green-600" onClick={() => selectedRequestId && handleAction('confirmReceiptAndCapture', selectedRequestId)} disabled={!!isActionLoading}>
              {isActionLoading ? <Loader2 className="animate-spin" /> : 'Підтвердити'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
