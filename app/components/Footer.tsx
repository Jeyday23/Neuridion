import Link from 'next/link'

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-zinc-200 py-5 px-6 text-center text-xs text-zinc-400 ${className}`}>
      Kodex Medical © 2026
      <span className="mx-2">·</span>
      <Link href="/privacy"  className="hover:text-zinc-600 transition-colors">Privacy</Link>
      <span className="mx-2">·</span>
      <Link href="/terms"    className="hover:text-zinc-600 transition-colors">Terms</Link>
      <span className="mx-2">·</span>
      <Link href="/imprint"  className="hover:text-zinc-600 transition-colors">Imprint</Link>
      <span className="mx-2">·</span>
      <Link href="/dpa"      className="hover:text-zinc-600 transition-colors">DPA</Link>
      <span className="mx-2">·</span>
      <a href="mailto:hello@kodex-medical.com" className="hover:text-zinc-600 transition-colors">Contact</a>
    </footer>
  )
}
