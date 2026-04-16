import { LoginForm } from './login-form'

export const metadata = {
  title: 'Sign in — Kodex',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Kodex
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in to your account
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
