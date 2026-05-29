import { createClient } from '@/lib/supabase/server'
import { SearchPanel } from './search-panel'

export const metadata = { title: 'Search — Neuridion' }

export default async function SearchPage() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer, intended_use, emdn_code, device_class, search_strategy')
    .order('created_at', { ascending: false })

  return <SearchPanel profiles={profiles ?? []} />
}
