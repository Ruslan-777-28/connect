
'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, serverTimestamp, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Camera, Package } from 'lucide-react';

const categories = [
  { 
    id: 'digital', 
    name: 'Цифрові товари', 
    subs: [
      { id: 'guides', name: 'Гайди та курси' },
      { id: 'photos', name: 'Фото та медіа' },
      { id: 'other', name: 'Інше' }
    ] 
  }
];

export default function CreateProductPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [subcategoryId, setSubcategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryText, setDeliveryText] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subOptions = useMemo(
    () => categories.find(c => c.id === categoryId)?.subs ?? [],
    [categoryId]
  );

  useEffect(() => {
    if (subOptions.length > 0 && !subcategoryId) {
      setSubcategoryId(subOptions[0].id);
    }
  }, [subOptions, subcategoryId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  async function onSubmit() {
    if (!user) {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Ви повинні увійти.' });
      return;
    }

    if (!title.trim() || !description.trim() || !price || !deliveryText.trim()) {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Заповніть всі обов\'язкові поля.' });
      return;
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Введіть коректну ціну.' });
      return;
    }

    setIsSaving(true);

    try {
      let imageUrl = '';
      if (imageFile) {
        const storage = getStorage();
        const storageRef = ref(storage, `products/${user.uid}/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(firestore, 'products'), {
        authorId: user.uid,
        categoryId,
        subcategoryId,
        title: title.trim(),
        description: description.trim(),
        deliveryText: deliveryText.trim(),
        imageUrl,
        price: priceNum,
        createdAt: serverTimestamp(),
      });

      toast({ title: 'Успіх', description: 'Товар опубліковано в магазині!' });
      router.push('/profile');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8">
      <Button 
        variant="ghost" 
        className="mb-8 -ml-2 text-muted-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Назад
      </Button>

      <h1 className="mb-8 text-2xl font-bold flex items-center gap-2">
        <Package className="h-6 w-6 text-primary" />
        Новий цифровий товар
      </h1>

      <div className="space-y-6">
        <div 
          className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <>
              <Camera className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Зображення вітрини</span>
            </>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageChange} 
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Категорія</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Категорія" />
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
                <SelectValue placeholder="Підкатегорія" />
              </SelectTrigger>
              <SelectContent>
                {subOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Заголовок</Label>
          <Input id="title" placeholder="Назва товару" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Опис товару</Label>
          <Textarea id="description" placeholder="Детально опишіть переваги..." className="min-h-[120px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Ціна (COIN)</Label>
          <Input id="price" type="number" placeholder="100" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>

        <div className="space-y-2 rounded-lg bg-primary/5 p-4 border border-primary/20">
          <Label htmlFor="delivery" className="text-primary font-bold">Контент для передачі</Label>
          <p className="text-[10px] text-muted-foreground mb-2 italic">Цей текст користувач отримає автоматично після підтвердження оплати (посилання, ключ, доступ тощо).</p>
          <Textarea id="delivery" placeholder="Посилання на файл або секретний ключ..." className="min-h-[100px] border-primary/20" value={deliveryText} onChange={(e) => setDeliveryText(e.target.value)} />
        </div>

        <Button className="w-full" size="lg" onClick={onSubmit} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Опублікувати товар'}
        </Button>
      </div>
    </div>
  );
}
