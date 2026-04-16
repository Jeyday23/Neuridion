'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get('upgraded');

  return (
    <div className="flex flex-col gap-6 p-8">
      {upgraded === 'true' && (
        <div className="bg-green-100 border border-green-400 text-green-800 rounded-xl px-6 py-4">
          🎉 <strong>Payment successful!</strong> Welcome to Kodex Pro!
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Welcome to Kodex</h1>
        <p className="text-zinc-500 mt-1">Your compliance workspace is ready.</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
