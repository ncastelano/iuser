
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1)
  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }
  if (data && data.length > 0) {
    console.log('Columns in profiles:', Object.keys(data[0]))
  }
}

check()
