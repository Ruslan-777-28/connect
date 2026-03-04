
'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';
import { isInstantOnline } from '@/lib/availability';

interface UserCardProps {
  user: UserProfile;
}

export function UserCard({ user }: UserCardProps) {
  const online = isInstantOnline(user.availability);

  return (
    <Link href={`/users/${user.id}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:-translate-y-1">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={user}
            className="mb-4 h-24 w-24"
          />
          <h3 className="text-lg font-semibold text-foreground">{user.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mb-4">
            {user.bio || 'No bio available.'}
          </p>

          <Button
            variant={online ? "default" : "secondary"}
            size="sm"
            className="w-full"
            asChild
          >
            <div>
              <User className="h-4 w-4 mr-2" />
              <span>View Profile</span>
            </div>
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
