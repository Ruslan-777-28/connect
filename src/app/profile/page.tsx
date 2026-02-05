'use client';

import { useAuth } from '@/hooks/use-auth';
import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProfilePage() {
  const { userProfile, loading } = useAuth();

  if (loading || !userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          My Profile
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Skeleton loader can be added here */}
            <p>Loading profile...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        My Profile
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm userProfile={userProfile} />
        </CardContent>
      </Card>
    </div>
  );
}
