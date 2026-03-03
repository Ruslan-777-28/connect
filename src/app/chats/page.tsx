'use client';

export default function ChatsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Chats
      </h1>
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p>No active chats yet.</p>
      </div>
    </div>
  );
}
