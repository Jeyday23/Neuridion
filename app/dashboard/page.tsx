'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get('upgraded');

  return (
    <div className="flex flex-col gap-6 p-8">
      {upgraded === 'true' && (
        <div className="bg-[rgba(5,150,105,0.08)] border border-[rgba(5,150,105,0.2)] text-[#059669] rounded-md px-6 py-4">
          <strong>Payment successful.</strong> Welcome to Neuridion Pro.
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold text-[#0F1F3D]">Welcome to Neuridion</h1>
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
