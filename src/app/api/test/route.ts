import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: store } = await supabase.from('stores').select('id, owner_id').limit(1).single();
    const response = await supabase.from('orders').insert({
        store_id: store?.id,
        buyer_id: store?.owner_id,
        buyer_name: 'test',
        buyer_profile_slug: 'test',
        total_amount: 10,
        status: 'pending',
        checkout_id: '12345'
    }).select();

    return NextResponse.json({ response });
}
