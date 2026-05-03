import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFeedbackNotification } from '@/lib/email'

const FeedbackSchema = z.object({
  rating:           z.number().int().min(1).max(5),
  most_useful:      z.array(z.string()).default([]),
  missing_features: z.string().nullable().optional(),
  triggered_by:     z.enum(['first_search', 'third_report']),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body      = await request.json() as unknown
    const validated = FeedbackSchema.parse(body)

    const admin = createAdminClient()
    const { error } = await admin.from('user_feedback').insert({
      user_id:          user.id,
      rating:           validated.rating,
      most_useful:      validated.most_useful,
      missing_features: validated.missing_features ?? null,
      triggered_by:     validated.triggered_by,
    })

    if (error) {
      console.error('Failed to save feedback:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    sendFeedbackNotification(validated).catch((err) =>
      console.error('Failed to send feedback email:', err)
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Feedback API error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
