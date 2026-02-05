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
import { Camera } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const profileFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  bio: z.string().max(160, 'Bio must not be longer than 160 characters.').optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileFormProps {
  userProfile: UserProfile;
}

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
        updatedAt: serverTimestamp()
      });

      toast({
        title: 'Success',
        description: 'Your profile has been updated.',
      });
      // Refresh is no longer needed with real-time updates
      // window.location.reload(); 
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
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
            <p>Upload a new avatar.</p>
            <p>Recommended size: 200x200px</p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Your Name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell us a little bit about yourself"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </Form>
  );
}
