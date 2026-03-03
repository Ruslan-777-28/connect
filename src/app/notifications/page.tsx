'use client';

export default function NotificationsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Notifications
      </h1>
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p>You have no notifications at the moment.</p>
      </div>
    </div>
  );
}
