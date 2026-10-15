ALTER TABLE tracker_entries
  ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX tracker_entries_invoice_id_idx ON tracker_entries(invoice_id);
