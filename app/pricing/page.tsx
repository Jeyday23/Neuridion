'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const plans = [
  {
    name: 'Free',
    price: '$0',
    description: 'Get started with Neuridion',
    features: ['5 documents', 'Basic compliance checks', 'Email support'],
    priceId: null,
  },
  {
    name: 'Pro',
    price: '$49/mo',
    description: 'For growing medical teams',
    features: ['Unlimited documents', 'AI compliance filter', 'Priority support', 'Audit logs'],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? 'price_1TMRvyB2xv3JtUxiFVtEB91P',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async (priceId: string) => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login?next=/pricing');
      return;
    }

    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_id: priceId }),
    });

    const json = await res.json();

    if (!res.ok || !json.url) {
      setError(json.error ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    router.push(json.url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-20 px-4">
      <h1 className="text-4xl font-bold text-center mb-12">Choose your plan</h1>
      {error && (
        <p className="text-center text-red-600 mb-6">{error}</p>
      )}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {plans.map((plan) => (
          <div key={plan.name} className="bg-white rounded-md border border-[#E2E8F0] p-8 flex flex-col">
            <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
            <p className="text-4xl font-bold mb-4">{plan.price}</p>
            <p className="text-gray-500 mb-6">{plan.description}</p>
            <ul className="space-y-2 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-gray-700">
                  ✅ {f}
                </li>
              ))}
            </ul>
            {plan.priceId ? (
              <button
                onClick={() => handleUpgrade(plan.priceId!)}
                disabled={loading}
                className="bg-[#0D9488] text-white rounded py-3 font-medium hover:bg-[#0F766E] disabled:opacity-50"
              >
                {loading ? 'Redirecting...' : 'Upgrade to Pro'}
              </button>
            ) : (
              <button className="bg-[#F8FAFC] text-[#6B7280] border border-[#E2E8F0] rounded py-3 font-medium cursor-default">
                Current Plan
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
