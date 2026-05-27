-- Table for appointments
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Clients can view their own appointments" 
ON public.appointments FOR SELECT 
USING (auth.uid() = client_id);

CREATE POLICY "Store owners can view appointments for their stores" 
ON public.appointments FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.stores 
        WHERE id = public.appointments.store_id 
        AND owner_id = auth.uid()
    )
);

CREATE POLICY "Clients can create appointment requests" 
ON public.appointments FOR INSERT 
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Store owners can update appointment status" 
ON public.appointments FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.stores 
        WHERE id = public.appointments.store_id 
        AND owner_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.stores 
        WHERE id = public.appointments.store_id 
        AND owner_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_appointment_updated
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Index for performance
CREATE INDEX IF NOT EXISTS appointments_store_date_idx ON public.appointments(store_id, start_time);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON public.appointments(client_id);
