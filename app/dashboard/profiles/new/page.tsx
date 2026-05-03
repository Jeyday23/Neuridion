import Link from 'next/link'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'New profile — Neuridion' }

export default function NewProfilePage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/profiles"
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          ← Profiles
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">New product profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Define the device you want to monitor in global recall databases.
        </p>
      </div>

      <div className="rounded-md border border-[#E2E8F0] bg-white px-8 py-8">
        <ProfileForm />
      </div>
    </div>
  )
}
