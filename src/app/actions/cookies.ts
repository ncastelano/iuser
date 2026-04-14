'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function setReferralCookieAndRedirect(profileSlug: string) {
  cookies().set('referral_profileSlug', profileSlug, {
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    path: '/',
  })
  redirect('/register')
}
