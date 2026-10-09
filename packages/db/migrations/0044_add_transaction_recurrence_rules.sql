-- Explicit corrections are distinct from the false/null defaults on imports.
ALTER TABLE transactions ADD COLUMN recurrence_override boolean NOT NULL DEFAULT false;

CREATE TABLE transaction_recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source_transaction_id uuid UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  name text NOT NULL,
  merchant_name text,
  amount numeric(10, 2) NOT NULL,
  currency text NOT NULL,
  date date NOT NULL,
  recurring boolean NOT NULL,
  frequency transaction_frequency,
  category_slug text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transaction_recurrence_rules_team_id_idx ON transaction_recurrence_rules(team_id);
ALTER TABLE transaction_recurrence_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can manage recurrence rules" ON transaction_recurrence_rules
  FOR ALL TO authenticated
  USING (team_id IN (SELECT private.get_teams_for_authenticated_user()))
  WITH CHECK (team_id IN (SELECT private.get_teams_for_authenticated_user()));

-- Preserve existing positive classifications. Historical false flags cannot be
-- distinguished from import defaults, so do not turn them into opt-out rules.
UPDATE transactions SET recurrence_override = true WHERE recurring = true;
INSERT INTO transaction_recurrence_rules
  (team_id, source_transaction_id, name, merchant_name, amount, currency, date, recurring, frequency, category_slug, updated_at)
SELECT team_id, id, name, merchant_name, amount, currency, date, true, frequency, category_slug, created_at
FROM transactions WHERE recurring = true AND frequency IS NOT NULL;
