
'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, updateDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { UserAvatar } from './user-avatar';
import { Camera, Languages } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const profileFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  bio: z.string().max(160, 'Bio must not be longer than 160 characters.').optional(),
  preferredLanguage: z.string().default('uk-UA'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileFormProps {
  userProfile: UserProfile;
}

const languages = [
  { value: 'uk-UA', label: 'Ukrainian' },
  { value: 'en-US', label: 'English' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'de-DE', label: 'German' },
  { value: 'fr-FR', label: 'French' },
];

export function ProfileForm({ userProfile }: ProfileFormProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: userProfile.name || '',
      bio: userProfile.bio || '',
      preferredLanguage: userProfile.preferredLanguage || 'uk-UA',
    },
  });

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  async function onSubmit(data: ProfileFormValues) {
    if (!user) return;
    setIsLoading(true);

    try {
      let avatarUrl = userProfile.avatarUrl;
      if (avatarFile) {
        const storage = getStorage();
        const storageRef = ref(storage, `avatars/${user.uid}`);
        const snapshot = await uploadBytes(storageRef, avatarFile);
        avatarUrl = await getDownloadURL(snapshot.ref);
      }

      const userDocRef = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(userDocRef, {
        name: data.name,
        bio: data.bio,
        avatarUrl: avatarUrl,
        preferredLanguage: data.preferredLanguage,
        updatedAt: serverTimestamp()
      });

      toast({
        title: 'Успіх',
        description: 'Профіль оновлено.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Помилка',
        description: 'Не вдалося оновити профіль.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center gap-6">
          <div className="relative">
            <UserAvatar 
              user={{...userProfile, avatarUrl: avatarPreview || userProfile.avatarUrl}} 
              className="h-24 w-24"
            />
            <Button
              type="button"
              size="icon"
              className="absolute bottom-0 right-0 rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png, image/jpeg, image/gif"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Завантажте нове фото профілю.</p>
            <p>Рекомендований розмір: 200x200px</p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ім'я</FormLabel>
              <FormControl>
                <Input placeholder="Ваше ім'я" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferredLanguage"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Languages className="h-4 w-4" />
                Рідна мова (для перекладу)
              </FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть мову" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Біографія</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Розкажіть трохи про себе"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Збереження...' : 'Зберегти зміни'}
        </Button>
      </form>
    </Form>
  );
}
