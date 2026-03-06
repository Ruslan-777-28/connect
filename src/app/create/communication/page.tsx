
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, serverTimestamp, doc, getDoc, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser, addDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2, Calendar as CalendarIcon, Clock } from 'lucide-react';
import type { CommunicationOffer, SchedulingType } from '@/lib/types';
import { cn } from '@/lib/utils';

const categories = [
  { 
    id: 'consulting', 
    name: 'Консалтинг', 
    subs: [
      { id: 'business', name: 'Бізнес-стратегія' },
      { id: 'marketing', name: 'Маркетинг' }
    ] 
  },
  { 
    id: 'tech', 
    name: 'Технології', 
    subs: [
      { id: 'programming', name: 'Програмування' },
      { id: 'design', name: 'Дизайн' }
    ] 
  },
];

export default function CreateCommunicationOfferPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const editId = params.get('id');
  const typeParam = params.get('type') as 'video' | 'file' | 'text' | null;

  const [type, setType] = useState<'video' | 'file' | 'text'>(typeParam ?? 'video');
  const [schedulingType, setSchedulingType] = useState<SchedulingType>('instant');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [duration, setDuration] = useState('30');
  
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [subcategoryId, setSubcategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!editId);

  const subOptions = useMemo(
    () => categories.find(c => c.id === categoryId)?.subs ?? [],
    [categoryId]
  );

  useEffect(() => {
    if (subOptions.length > 0 && !subcategoryId) {
      setSubcategoryId(subOptions[0].id);
    }
  }, [subOptions, subcategoryId]);

  // Load existing offer if editing
  useEffect(() => {
    async function loadOffer() {
      if (!editId || !firestore) return;
      try {
        const snap = await getDoc(doc(firestore, 'communicationOffers', editId));
        if (snap.exists()) {
          const data = snap.data() as CommunicationOffer;
          setType(data.type);
          setCategoryId(data.categoryId);
          setSubcategoryId(data.subcategoryId);
          setSchedulingType(data.schedulingType || 'instant');
          
          if (data.schedulingType === 'scheduled' && data.scheduledStart) {
            const start = data.scheduledStart.toDate();
            setScheduledDate(start.toISOString().split('T')[0]);
            setScheduledTime(start.toTimeString().slice(0, 5));
            setDuration(String(data.durationMinutes || 30));
          }
          
          let p = '';
          if (data.type === 'video') {
            p = String(data.schedulingType === 'scheduled' ? data.pricing.ratePerSession : data.pricing.ratePerMinute || '');
          } else if (data.type === 'file') {
            p = String(data.pricing.ratePerFile || '');
          } else if (data.type === 'text') {
            p = String(data.pricing.ratePerQuestion || '');
          }
          setPrice(p);
        }
      } catch (e) {
        console.error('Error loading offer:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadOffer();
  }, [editId, firestore]);

  const priceLabel = useMemo(() => {
    if (type === 'video') {
      return schedulingType === 'scheduled' ? 'Вартість сеансу (COIN)' : 'Вартість 1 хвилини (COIN)';
    }
    if (type === 'file') return 'Вартість 1 файлу (COIN)';
    if (type === 'text') return 'Вартість 1 питання (COIN)';
    return 'Вартість (COIN)';
  }, [type, schedulingType]);

  async function onSubmit() {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ви повинні увійти, щоб зберегти пропозицію.' });
      return;
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Введіть коректну ціну.' });
      return;
    }

    setIsSaving(true);
    
    const pricing: any = { currency: 'COIN' };
    let scheduledStart = null;
    let scheduledEnd = null;

    if (type === 'video') {
      if (schedulingType === 'scheduled') {
        pricing.ratePerSession = priceNum;
        const start = new Date(`${scheduledDate}T${scheduledTime}`);
        if (isNaN(start.getTime())) {
          toast({ variant: 'destructive', title: 'Помилка', description: 'Вкажіть коректну дату та час.' });
          setIsSaving(false);
          return;
        }
        scheduledStart = Timestamp.fromDate(start);
        scheduledEnd = Timestamp.fromDate(new Date(start.getTime() + Number(duration) * 60000));
      } else {
        pricing.ratePerMinute = priceNum;
      }
    } else if (type === 'file') {
      pricing.ratePerFile = priceNum;
    } else if (type === 'text') {
      pricing.ratePerQuestion = priceNum;
    }

    const offerData = {
      ownerId: user.uid,
      type,
      schedulingType: type === 'video' ? schedulingType : 'instant',
      scheduledStart,
      scheduledEnd,
      durationMinutes: type === 'video' && schedulingType === 'scheduled' ? Number(duration) : null,
      categoryId,
      subcategoryId,
      pricing,
      status: 'active',
      updatedAt: serverTimestamp(),
    };

    try {
      if (editId) {
        setDocumentNonBlocking(doc(firestore, 'communicationOffers', editId), {
          ...offerData,
        }, { merge: true });
        toast({ title: 'Оновлено', description: 'Зміни збережено!' });
      } else {
        await addDocumentNonBlocking(collection(firestore, 'communicationOffers'), {
          ...offerData,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Success', description: 'Пропозицію успішно створено!' });
      }
      router.push('/profile');
    } catch (e) {
      // Error is handled by global emitter
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete() {
    if (!editId || !confirm('Ви впевнені, що хочете видалити цю пропозицію?')) return;
    
    setIsSaving(true);
    try {
      deleteDocumentNonBlocking(doc(firestore, 'communicationOffers', editId));
      toast({ title: 'Видалено', description: 'Пропозицію було видалено.' });
      router.push('/profile');
    } catch (e) {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-2xl p-4 py-8 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Завантаження даних...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <Button 
          variant="ghost" 
          className="-ml-2 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>

        {editId && (
          <Button 
            variant="ghost" 
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            disabled={isSaving}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </Button>
        )}
      </div>

      <h1 className="mb-8 text-2xl font-bold capitalize">
        {editId ? 'Редагування' : 'Налаштування'}: {type === 'video' ? 'Відеочат' : type === 'file' ? 'Файл' : 'Питання'}
      </h1>

      <div className="space-y-6">
        {type === 'video' && (
          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-base">Тип сеансу</Label>
              <p className="text-sm text-muted-foreground">
                {schedulingType === 'instant' ? 'Онлайн зараз (тарифікація за хв)' : 'За розкладом (фіксована ціна)'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-bold", schedulingType === 'instant' ? "text-primary" : "text-muted-foreground")}>ONLINE</span>
              <Switch 
                checked={schedulingType === 'scheduled'}
                onCheckedChange={(checked) => setSchedulingType(checked ? 'scheduled' : 'instant')}
              />
              <span className={cn("text-xs font-bold", schedulingType === 'scheduled' ? "text-primary" : "text-muted-foreground")}>SCHEDULED</span>
            </div>
          </div>
        )}

        {type === 'video' && schedulingType === 'scheduled' && (
          <div className="grid gap-4 p-4 border rounded-lg animate-in fade-in duration-300">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><CalendarIcon className="h-3 w-3" /> Дата</Label>
                <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Clock className="h-3 w-3" /> Час початку</Label>
                <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Тривалість (хвилини)</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 хвилин</SelectItem>
                  <SelectItem value="30">30 хвилин</SelectItem>
                  <SelectItem value="45">45 хвилин</SelectItem>
                  <SelectItem value="60">1 година</SelectItem>
                  <SelectItem value="90">1.5 години</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Категорія</Label>
          <Select value={categoryId} onValueChange={(val) => {
            setCategoryId(val);
            const subs = categories.find(c => c.id === val)?.subs ?? [];
            setSubcategoryId(subs[0]?.id ?? '');
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Оберіть категорію" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Підкатегорія</Label>
          <Select value={subcategoryId} onValueChange={setSubcategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Оберіть підкатегорію" />
            </SelectTrigger>
            <SelectContent>
              {subOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">{priceLabel}</Label>
          <Input
            id="price"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <Button 
          className="w-full" 
          size="lg"
          onClick={onSubmit} 
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Збереження...
            </>
          ) : (
            editId ? 'Оновити пропозицію' : 'Створити пропозицію'
          )}
        </Button>
      </div>
    </div>
  );
}
