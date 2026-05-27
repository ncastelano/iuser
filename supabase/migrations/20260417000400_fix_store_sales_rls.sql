-- Ensure store_sales has proper policies for checkout
ALTER TABLE store_sales ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert into store_sales (since anyone can initiate a checkout via WhatsApp)
CREATE POLICY "Allow anyone to insert sales" ON store_sales
    FOR INSERT WITH CHECK (true);

-- Allow store owners to view and update their own sales
-- We assume 'store_id' maps to a store owned by the user.
-- To be simpler and safer for now, we'll allow owners of the store to see it.
CREATE POLICY "Allow store owners to manage their sales" ON store_sales
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM stores 
            WHERE stores.id = store_sales.store_id 
            AND stores.owner_id = auth.uid()
        )
    );

-- Also allow buyers to see their own sales if they were logged in
CREATE POLICY "Allow buyers to see their sales" ON store_sales
    FOR SELECT USING (buyer_id = auth.uid());

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
