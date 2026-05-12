import Link from 'next/link'

export const metadata = { title: 'Right of Withdrawal — Neuridion' }

export default function WithdrawalPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            DRAFT — Pending legal review. Do not treat as legally binding until reviewed by qualified counsel.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Right of Withdrawal</h1>
        <p className="text-sm text-zinc-500 mb-1">Widerrufsbelehrung</p>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 12 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Right of withdrawal</h2>
            <p>
              If you are a consumer within the meaning of &sect; 13 BGB (German Civil Code) — that is,
              a natural person entering into the contract for purposes that are primarily outside your
              trade, business, or profession — you have the right to withdraw from this contract within
              <strong> 14 days</strong> without giving any reason.
            </p>
            <p className="mt-2">
              The withdrawal period is 14 days from the day you completed your subscription purchase or
              account registration for a paid plan.
            </p>
            <p className="mt-2">
              To exercise your right of withdrawal, you must inform us of your decision by means of a
              clear statement (e.g. an email). You may use the model withdrawal form in Section 5 below,
              but this is not mandatory.
            </p>
            <div className="mt-3 rounded border border-zinc-200 px-4 py-3 text-sm">
              <p className="font-semibold text-zinc-900">Contact for withdrawal declarations:</p>
              <p><strong>[COMPANY LEGAL NAME — PLACEHOLDER]</strong></p>
              <p><strong>[STREET ADDRESS — PLACEHOLDER]</strong></p>
              <p><strong>[POSTCODE AND CITY — PLACEHOLDER]</strong>, Germany</p>
              <p className="mt-1">
                Email:{' '}
                <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                  info@neuridion.eu
                </a>
              </p>
            </div>
            <p className="mt-3">
              To meet the withdrawal deadline, it is sufficient to send your communication before the
              withdrawal period has expired.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. Effects of withdrawal</h2>
            <p>
              If you withdraw from this contract, we shall reimburse all payments we have received from you
              without undue delay and in any event not later than 14 days from the day on which we are
              informed of your decision to withdraw. We will carry out such reimbursement using the same
              means of payment (Stripe refund to the original payment method) unless you have expressly
              agreed otherwise. You will not incur any fees as a result of such reimbursement.
            </p>
            <p className="mt-2">Upon withdrawal:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>Your access to paid features will be revoked and your account will revert to the free plan.</li>
              <li>
                Your personal data will be handled in accordance with our{' '}
                <Link href="/privacy" className="text-[#0D9488] hover:underline">Privacy Policy</Link>.
                You may separately request account deletion under GDPR Art. 17.
              </li>
              <li>
                Search runs, reports, and device profiles created during the subscription remain accessible
                on the free plan subject to its feature limits, unless you request their deletion.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              3. Early expiry for digital services
            </h2>
            <p>
              The right of withdrawal expires prematurely under &sect; 356(5) BGB in conjunction with
              Art. 16(m) of EU Directive 2011/83/EU if:
            </p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>
                We have begun the performance of the digital service (i.e. you have actively used paid
                features such as running searches, generating reports, or accessing results beyond free
                plan limits);
              </li>
              <li>
                You gave your prior express consent to the commencement of performance before the expiry
                of the withdrawal period; and
              </li>
              <li>You acknowledged that you would lose your right of withdrawal upon full commencement of performance.</li>
            </ol>
            <p className="mt-2">
              During the checkout process, you will be asked to confirm these conditions. If you gave
              that consent and began using the service, the right of withdrawal no longer applies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Free trials</h2>
            <p>
              If you are using the service under a free trial or a promotional trial code (e.g. redeemed
              at a trade show), no payment has been collected. Exercising the right of withdrawal simply
              ends your trial access. No refund is owed. Your account reverts to the free plan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Model withdrawal form</h2>
            <p className="text-sm text-zinc-500 mb-3">
              (Complete and return this form only if you wish to withdraw from the contract.)
            </p>
            <div className="rounded border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm space-y-3">
              <p>
                <strong>To:</strong><br />
                [COMPANY LEGAL NAME — PLACEHOLDER]<br />
                [STREET ADDRESS — PLACEHOLDER]<br />
                [POSTCODE AND CITY — PLACEHOLDER], Germany<br />
                Email: info@neuridion.eu
              </p>
              <p>
                I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the
                provision of the following service:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Neuridion subscription plan: _______________</li>
                <li>Ordered on (*) / received on (*): _______________</li>
                <li>Name of the consumer(s): _______________</li>
                <li>Address of the consumer(s): _______________</li>
                <li>Email address used for the Neuridion account: _______________</li>
                <li>Date: _______________</li>
                <li>Signature (only if sent on paper): _______________</li>
              </ul>
              <p className="text-zinc-500">(*) Delete as appropriate.</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Contact</h2>
            <p>
              Questions about this cancellation policy:{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/" className="text-[#0D9488] hover:underline">&larr; Home</Link>
          <Link href="/terms" className="text-[#0D9488] hover:underline">Terms</Link>
          <Link href="/privacy" className="text-[#0D9488] hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  )
}
