import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { storeId, sessionId, viewerId, anonymousId, deviceType, referrer, userAgent } =
      await req.json()

    if (!storeId || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    await supabaseAdmin.rpc('record_store_visit', {
      p_store_id: storeId,
      p_session_id: sessionId,
      p_viewer_id: viewerId ?? null,
      p_anonymous_id: anonymousId ?? null,
      p_device_type: deviceType ?? null,
      p_referrer: referrer ?? null,
      p_user_agent: userAgent ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
