
'use client';

import { MessageSquare } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { PostComments } from './PostComments';

interface CommentButtonProps {
  postId: string;
  className?: string;
}

export function CommentButton({ postId, className }: CommentButtonProps) {
  const firestore = useFirestore();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch comments to get the count
  const commentsQuery = useMemoFirebase(
    () => (postId ? collection(firestore, 'posts', postId, 'comments') : null),
    [postId, firestore]
  );

  const { data: comments, isLoading } = useCollection(commentsQuery);
  const count = comments?.length || 0;

  return (
    <>
      <Button
        variant="ghost"
        className={cn(
          "h-8 px-2 flex items-center gap-1.5 transition-all duration-200 text-muted-foreground hover:text-primary",
          className
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        disabled={isLoading}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="text-[11px] font-extrabold tabular-nums">
          {count}
        </span>
      </Button>

      <PostComments 
        postId={postId} 
        open={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  );
}
