'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';

interface UserCardProps {
  user: UserProfile;
}

export function UserCard({ user }: UserCardProps) {
  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Future call logic will go here
    console.log(`Calling ${user.name}...`);
  };

  return (
    <Link href={`/users/${user.id}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:-translate-y-1">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={user}
            className="mb-4 h-24 w-24 border-2 border-primary/20"
          />
          <h3 className="text-lg font-semibold text-foreground">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button
            variant="outline"
            size="icon"
            className="mt-4"
            onClick={handleCallClick}
          >
            <Phone className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
