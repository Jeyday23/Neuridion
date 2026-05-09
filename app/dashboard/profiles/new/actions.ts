'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ProfileState = { error: string } | null

export async function createProfile(
  _prevState: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Not authenticated.' }
  }

  const deviceName  = (formData.get('device_name')  as string)?.trim()
  const manufacturer = (formData.get('manufacturer') as string)?.trim()
  const emnCode     = (formData.get('emdn_code')     as string)?.trim() || null
  const deviceClass = (formData.get('device_class')  as string) || null
  const intendedUse = (formData.get('intended_use')  as string)?.trim() || null

  if (!deviceName || !manufacturer) {
    return { error: 'Device name and manufacturer are required.' }
  }

  // Handle IFU file upload if provided
  let ifuStoragePath: string | null = null
  const ifuFile = formData.get('ifu_file') as File | null
  if (ifuFile && ifuFile.size > 0) {
    const ext = ifuFile.name.split('.').pop()
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('ifu-documents')
      .upload(path, ifuFile, { contentType: ifuFile.type, upsert: false })

    if (uploadError) {
      return { error: `IFU upload failed: ${uploadError.message}` }
    }
    ifuStoragePath = path
  }

  const { error } = await supabase.from('product_profiles').insert({
    user_id:          user.id,
    device_name:      deviceName,
    manufacturer:     manufacturer,
    emdn_code:        emnCode,
    device_class:     deviceClass,
    intended_use:     intendedUse,
    ifu_storage_path: ifuStoragePath,
  })

  if (error) {
    console.error('[profiles:create]', error.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  redirect('/dashboard/profiles')
}
