ALTER TABLE invoice_recurring
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20, 8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS converted_currency text,
  ADD COLUMN IF NOT EXISTS converted_amount numeric(10, 2);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20, 8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS converted_currency text,
  ADD COLUMN IF NOT EXISTS converted_amount numeric(10, 2);
