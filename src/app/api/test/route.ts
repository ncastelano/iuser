import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST() {

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
