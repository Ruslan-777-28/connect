
'use client';

import { useState } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, doc } from 'firebase/firestore';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { UserAvatar } from './user-avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Comment, UserProfile } from '@/lib/types';

interface PostCommentsProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export function PostComments({ postId, open, onClose }: PostCommentsProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const commentsQuery = useMemoFirebase(
    () => (postId ? query(
      collection(firestore, 'posts', postId, 'comments'),
      orderBy('createdAt', 'desc')
    ) : null),
    [postId, firestore]
  );

  const { data: comments, isLoading } = useCollection<Comment>(commentsQuery);

  const handleSend = async () => {
    if (!user || !newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDocumentNonBlocking(collection(firestore, 'posts', postId, 'comments'), {
        uid: user.uid,
        text: newComment.trim(),
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Коментарі</SheetTitle>
          <SheetDescription>
            Поділіться своєю думкою про цю публікацію.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : comments && comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map((comment) => (
                <CommentItem 
                  key={comment.id} 
                  comment={comment} 
                  onDelete={() => deleteDocumentNonBlocking(doc(firestore, 'posts', postId, 'comments', comment.id))}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Ще немає жодного коментаря. Будьте першим!
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t bg-background">
          {user ? (
            <div className="flex gap-2 items-start">
              <Textarea 
                placeholder="Ваш коментар..." 
                className="min-h-[80px] resize-none"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <Button 
                size="icon" 
                className="shrink-0" 
                disabled={!newComment.trim() || isSubmitting}
                onClick={handleSend}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground">
              Увійдіть, щоб залишати коментарі.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CommentItem({ comment, onDelete }: { comment: Comment, onDelete: () => void }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const userRef = useMemoFirebase(() => doc(firestore, 'users', comment.uid), [comment.uid, firestore]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const isOwner = user?.uid === comment.uid;

  return (
    <div className="flex gap-3 group">
      <UserAvatar user={profile || { name: '...' } as any} className="h-8 w-8 shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold">{profile?.name || 'Завантаження...'}</span>
          <span className="text-[10px] text-muted-foreground">
            {comment.createdAt?.toDate?.()?.toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed bg-muted/30 p-2 rounded-lg">
          {comment.text}
        </p>
        {isOwner && (
          <button 
            onClick={onDelete}
            className="text-[10px] text-destructive hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3" /> Видалити
          </button>
        )}
      </div>
    </div>
  );
}
