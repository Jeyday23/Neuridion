import Link from 'next/link'
import './globals.css'

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6">
          <div className="text-center max-w-sm">
            <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Page not found</h1>
            <p className="text-sm text-[#0F766E] mb-6">
              The page you&apos;re looking for doesn&apos;t exist.
            </p>
            <Link
              href="/"
              className="px-4 py-2 bg-[#0F1F3D] text-white rounded text-sm font-medium hover:bg-[#1a2d52] transition-colors"
            >
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
