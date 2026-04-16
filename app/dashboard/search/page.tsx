import { createClient } from '@/lib/supabase/server'
import { SearchPanel } from './search-panel'

export const metadata = { title: 'Search — Kodex' }

export default async function SearchPage() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer')
    .order('created_at', { ascending: false })

  return <SearchPanel profiles={profiles ?? []} />
}
