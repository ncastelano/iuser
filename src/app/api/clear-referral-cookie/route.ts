import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  cookies().delete('referral_profileSlug')
  return NextResponse.json({ success: true })
}
