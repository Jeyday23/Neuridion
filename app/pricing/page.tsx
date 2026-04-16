'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const plans = [
  {
    name: 'Free',
    price: '$0',
    description: 'Get started with Kodex',
    features: ['5 documents', 'Basic compliance checks', 'Email support'],
    priceId: null,
  },
  {
    name: 'Pro',
    price: '$49/mo',
    description: 'For growing medical teams',
    features: ['Unlimited documents', 'AI compliance filter', 'Priority support', 'Audit logs'],
    priceId: 'price_1TMRvyB2xv3JtUxiFVtEB91P', // 👈 replace with your Stripe price ID
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async (priceId: string) => {
    setLoading(true);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId,
        userId: 'test-user-123', // TODO: replace with real user ID
        userEmail: 'test@example.com', // TODO: replace with real user email
      }),
    });
    const { url } = await res.json();
    if (url) router.push(url);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-20 px-4">
      <h1 className="text-4xl font-bold text-center mb-12">Choose your plan</h1>
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {plans.map((plan) => (
          <div key={plan.name} className="bg-white rounded-2xl shadow p-8 flex flex-col">
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
                className="bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Redirecting...' : 'Upgrade to Pro'}
              </button>
            ) : (
              <button className="bg-gray-200 text-gray-600 rounded-xl py-3 font-semibold cursor-default">
                Current Plan
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
