
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
import { Loader2, ArrowLeft, Camera, Image as ImageIcon } from 'lucide-react';

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

export default function CreatePostPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [subcategoryId, setSubcategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
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
      toast({ variant: 'destructive', title: 'Помилка', description: 'Ви повинні увійти, щоб створити пост.' });
      return;
    }

    if (!title.trim() || !content.trim()) {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Заповніть заголовок та зміст посту.' });
      return;
    }

    setIsSaving(true);

    try {
      let imageUrl = '';
      if (imageFile) {
        const storage = getStorage();
        const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(firestore, 'posts'), {
        authorId: user.uid,
        categoryId,
        subcategoryId,
        title: title.trim(),
        content: content.trim(),
        imageUrl,
        viewCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({ title: 'Успіх', description: 'Пост опубліковано!' });
      router.push('/profile');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message || 'Не вдалося створити пост.' });
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

      <h1 className="mb-8 text-2xl font-bold">Створити новий пост</h1>

      <div className="space-y-6">
        <div 
          className="relative aspect-video w-full overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <>
              <Camera className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Оберіть зображення для посту</span>
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
            <Select value={categoryId} onValueChange={(val) => {
              setCategoryId(val);
              const subs = categories.find(c => c.id === val)?.subs ?? [];
              setSubcategoryId(subs[0]?.id ?? '');
            }}>
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
          <Input
            id="title"
            placeholder="Про що ваша стаття?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Зміст</Label>
          <Textarea
            id="content"
            placeholder="Напишіть текст вашої публікації..."
            className="min-h-[250px] resize-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
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
              Публікація...
            </>
          ) : (
            'Опублікувати пост'
          )}
        </Button>
      </div>
    </div>
  );
}
