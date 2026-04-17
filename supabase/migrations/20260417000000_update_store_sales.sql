-- Create store_sales table if it doesn't exist
CREATE TABLE IF NOT EXISTS store_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    checkout_id UUID,
    buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    buyer_name TEXT,
    buyer_profile_slug TEXT,
    store_slug TEXT,
    product_id UUID,
    product_name TEXT,
    price NUMERIC NOT NULL,
    quantity INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add columns if table already exists (resilient migration)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_sales' AND column_name='checkout_id') THEN
        ALTER TABLE store_sales ADD COLUMN checkout_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_sales' AND column_name='buyer_profile_slug') THEN
        ALTER TABLE store_sales ADD COLUMN buyer_profile_slug TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_sales' AND column_name='store_slug') THEN
        ALTER TABLE store_sales ADD COLUMN store_slug TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_sales' AND column_name='status') THEN
        ALTER TABLE store_sales ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_sales' AND column_name='quantity') THEN
        ALTER TABLE store_sales ADD COLUMN quantity INTEGER DEFAULT 1;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE store_sales ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone can insert a sale (buyers)
DROP POLICY IF EXISTS "Anyone can insert sales" ON store_sales;
CREATE POLICY "Anyone can insert sales" ON store_sales FOR INSERT WITH CHECK (true);

-- Store owners can view sales for their stores
DROP POLICY IF EXISTS "Owners can view their store sales" ON store_sales;
CREATE POLICY "Owners can view their store sales" ON store_sales FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM stores 
        WHERE stores.id = store_sales.store_id 
        AND stores.owner_id = (select auth.uid())
    )
);

-- Store owners can update sales (e.g. status)
DROP POLICY IF EXISTS "Owners can update their store sales" ON store_sales;
CREATE POLICY "Owners can update their store sales" ON store_sales FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM stores 
        WHERE stores.id = store_sales.store_id 
        AND stores.owner_id = (select auth.uid())
    )
);
