
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkColumns() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1)
    
    if (error) {
        console.error('Error fetching products:', error)
        return
    }

    if (data && data.length > 0) {
        console.log('Columns in products:', Object.keys(data[0]))
    } else {
        console.log('No products found to check columns.')
    }
}

checkColumns()
