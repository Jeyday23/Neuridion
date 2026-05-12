import Link from 'next/link'
import { ManageCookiesButton } from './ManageCookiesButton'

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-zinc-200 py-5 px-6 text-center text-xs text-zinc-400 ${className}`}>
      © 2026 Neuridion
      <span className="mx-2">·</span>
      <Link href="/privacy"  className="hover:text-zinc-600 transition-colors">Privacy</Link>
      <span className="mx-2">·</span>
      <Link href="/terms"    className="hover:text-zinc-600 transition-colors">Terms</Link>
      <span className="mx-2">·</span>
      <Link href="/withdrawal" className="hover:text-zinc-600 transition-colors">Withdrawal</Link>
      <span className="mx-2">·</span>
      <Link href="/imprint"  className="hover:text-zinc-600 transition-colors">Imprint</Link>
      <span className="mx-2">·</span>
      <Link href="/dpa"      className="hover:text-zinc-600 transition-colors">DPA</Link>
      <span className="mx-2">·</span>
      <Link href="/ai-transparency" className="hover:text-zinc-600 transition-colors">AI Transparency</Link>
      <span className="mx-2">·</span>
      <Link href="/accessibility" className="hover:text-zinc-600 transition-colors">Accessibility</Link>
      <span className="mx-2">·</span>
      <Link href="/contact" className="hover:text-zinc-600 transition-colors">Contact</Link>
      <span className="mx-2">·</span>
      <ManageCookiesButton />
    </footer>
  )
}
