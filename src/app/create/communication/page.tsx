
'use client';

import { useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, serverTimestamp, doc } from 'firebase/firestore';
import { useFirestore, useUser, addDocumentNonBlocking } from '@/firebase';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

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

  const type = (params.get('type') as 'video' | 'file' | 'text' | null) ?? 'video';

  const [categoryId, setCategoryId] = useState(categories[0].id);
  const subOptions = useMemo(
    () => categories.find(c => c.id === categoryId)?.subs ?? [],
    [categoryId]
  );
  const [subcategoryId, setSubcategoryId] = useState(subOptions[0]?.id ?? '');

  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const priceLabel = useMemo(() => {
    switch(type) {
      case 'video': return 'Вартість 1 хвилини ($)';
      case 'file': return 'Вартість 1 файлу ($)';
      case 'text': return 'Вартість 1 питання ($)';
      default: return 'Вартість ($)';
    }
  }, [type]);

  async function onSubmit() {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ви повинні увійти, щоб створити пропозицію.' });
      return;
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Введіть коректну ціну.' });
      return;
    }

    setIsSaving(true);
    
    const pricing: any = { currency: 'USD' };
    if (type === 'video') pricing.ratePerMinute = priceNum;
    if (type === 'file') pricing.ratePerFile = priceNum;
    if (type === 'text') pricing.ratePerQuestion = priceNum;

    const offerData = {
      ownerId: user.uid,
      type,
      categoryId,
      subcategoryId,
      pricing,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDocumentNonBlocking(collection(firestore, 'communicationOffers'), offerData);
      toast({ title: 'Success', description: 'Пропозицію успішно створено!' });
      router.push('/');
    } catch (e) {
      // Error is handled by global emitter
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8">
      <Button 
        variant="ghost" 
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Назад
      </Button>

      <h1 className="mb-8 text-2xl font-bold capitalize">
        Налаштування: {type}
      </h1>

      <div className="space-y-6">
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
            'Створити пропозицію'
          )}
        </Button>
      </div>
    </div>
  );
}
