import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const referralSlug = cookieStore.get('referral_profileSlug')?.value

  return NextResponse.json({ referralSlug: referralSlug || null })
}
