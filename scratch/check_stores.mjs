import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Try to find .env.local
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath))
  for (const k in envConfig) {
    process.env[k] = envConfig[k]
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkStores() {
  const { data, error, count } = await supabase
    .from('stores')
    .select('*', { count: 'exact' })
  
  if (error) {
    console.error('Error fetching stores:', error)
  } else {
    console.log(`Found ${data?.length} stores (Count: ${count})`)
    if (data && data.length > 0) {
      console.log('Sample store:', JSON.stringify(data[0], null, 2))
    }
  }
}

checkStores()
