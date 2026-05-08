import { redirect } from 'next/navigation'
import { NeuridionSignIn } from './sign-in-page'

export const metadata = {
  title: 'Sign in — Neuridion',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const params = await searchParams
  if (params.deleted === '1') {
    redirect('/login/password?deleted=1')
  }

  return <NeuridionSignIn />
}
