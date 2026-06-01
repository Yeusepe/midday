CREATE OR REPLACE FUNCTION public.global_search(
  p_search_term text,
  p_team_id uuid,
  p_search_lang text DEFAULT 'english',
  p_limit integer DEFAULT 30,
  p_items_per_table_limit integer DEFAULT 5,
  p_relevance_threshold real DEFAULT 0.01
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  relevance real,
  created_at timestamp with time zone,
  data jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_search_term text := NULLIF(trim(COALESCE(p_search_term, '')), '');
  v_config regconfig :=
    CASE lower(COALESCE(NULLIF(p_search_lang, ''), 'english'))
      WHEN 'simple' THEN 'simple'::regconfig
      WHEN 'en' THEN 'english'::regconfig
      WHEN 'english' THEN 'english'::regconfig
      WHEN 'de' THEN 'german'::regconfig
      WHEN 'german' THEN 'german'::regconfig
      WHEN 'fr' THEN 'french'::regconfig
      WHEN 'french' THEN 'french'::regconfig
      WHEN 'sv' THEN 'swedish'::regconfig
      WHEN 'swedish' THEN 'swedish'::regconfig
      ELSE 'english'::regconfig
    END;
  v_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 1000);
  v_items_per_table_limit integer := LEAST(GREATEST(COALESCE(p_items_per_table_limit, 5), 1), 100);
  v_relevance_threshold real := COALESCE(p_relevance_threshold, 0.01);
BEGIN
  IF p_team_id IS NULL OR v_search_term IS NULL THEN
    RETURN;
  END IF;

  v_query := websearch_to_tsquery(v_config, v_search_term);

  IF v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    (
      SELECT
        t.id,
        'transaction'::text AS type,
        t.name AS title,
        ts_rank(t.fts_vector, v_query)::real AS relevance,
        t.created_at,
        jsonb_build_object(
          'name', t.name,
          'description', t.description,
          'amount', t.amount,
          'currency', t.currency,
          'date', t.date,
          'status', t.status
        ) AS data
      FROM public.transactions t
      WHERE t.team_id = p_team_id
        AND t.fts_vector @@ v_query
        AND ts_rank(t.fts_vector, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, t.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        i.id,
        'invoice'::text AS type,
        COALESCE(i.invoice_number, i.customer_name, i.id::text) AS title,
        ts_rank(i.fts, v_query)::real AS relevance,
        i.created_at,
        jsonb_build_object(
          'invoiceNumber', i.invoice_number,
          'customerName', i.customer_name,
          'amount', i.amount,
          'currency', i.currency,
          'status', i.status,
          'dueDate', i.due_date
        ) AS data
      FROM public.invoices i
      WHERE i.team_id = p_team_id
        AND i.fts @@ v_query
        AND ts_rank(i.fts, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, i.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        c.id,
        'customer'::text AS type,
        c.name AS title,
        ts_rank(c.fts, v_query)::real AS relevance,
        c.created_at,
        jsonb_build_object(
          'name', c.name,
          'email', c.email,
          'contact', c.contact,
          'website', c.website,
          'status', c.status
        ) AS data
      FROM public.customers c
      WHERE c.team_id = p_team_id
        AND c.fts @@ v_query
        AND ts_rank(c.fts, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, c.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        d.id,
        'document'::text AS type,
        COALESCE(d.title, d.name, d.id::text) AS title,
        GREATEST(
          COALESCE(ts_rank(d.fts_english, v_query), 0),
          COALESCE(ts_rank(d.fts_language, v_query), 0),
          COALESCE(ts_rank(d.fts_simple, v_query), 0),
          COALESCE(ts_rank(d.fts, v_query), 0)
        )::real AS relevance,
        d.created_at,
        jsonb_build_object(
          'name', d.name,
          'title', d.title,
          'tag', d.tag,
          'date', d.date,
          'processingStatus', d.processing_status
        ) AS data
      FROM public.documents d
      WHERE d.team_id = p_team_id
        AND (
          d.fts_english @@ v_query
          OR d.fts_language @@ v_query
          OR d.fts_simple @@ v_query
          OR d.fts @@ v_query
        )
        AND GREATEST(
          COALESCE(ts_rank(d.fts_english, v_query), 0),
          COALESCE(ts_rank(d.fts_language, v_query), 0),
          COALESCE(ts_rank(d.fts_simple, v_query), 0),
          COALESCE(ts_rank(d.fts, v_query), 0)
        ) >= v_relevance_threshold
      ORDER BY relevance DESC, d.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        p.id,
        'invoice_product'::text AS type,
        p.name AS title,
        ts_rank(p.fts, v_query)::real AS relevance,
        p.created_at,
        jsonb_build_object(
          'name', p.name,
          'description', p.description,
          'price', p.price,
          'currency', p.currency,
          'unit', p.unit
        ) AS data
      FROM public.invoice_products p
      WHERE p.team_id = p_team_id
        AND p.fts @@ v_query
        AND ts_rank(p.fts, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, p.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        tp.id,
        'tracker_project'::text AS type,
        tp.name AS title,
        ts_rank(tp.fts, v_query)::real AS relevance,
        tp.created_at,
        jsonb_build_object(
          'name', tp.name,
          'description', tp.description,
          'rate', tp.rate,
          'currency', tp.currency,
          'status', tp.status,
          'billable', tp.billable
        ) AS data
      FROM public.tracker_projects tp
      WHERE tp.team_id = p_team_id
        AND tp.fts @@ v_query
        AND ts_rank(tp.fts, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, tp.created_at DESC
      LIMIT v_items_per_table_limit
    )
    UNION ALL
    (
      SELECT
        ib.id,
        'inbox'::text AS type,
        COALESCE(ib.display_name, ib.file_name, ib.invoice_number, ib.id::text) AS title,
        ts_rank(ib.fts, v_query)::real AS relevance,
        ib.created_at,
        jsonb_build_object(
          'displayName', ib.display_name,
          'fileName', ib.file_name,
          'amount', ib.amount,
          'currency', ib.currency,
          'status', ib.status,
          'invoiceNumber', ib.invoice_number
        ) AS data
      FROM public.inbox ib
      WHERE ib.team_id = p_team_id
        AND ib.fts @@ v_query
        AND ts_rank(ib.fts, v_query) >= v_relevance_threshold
      ORDER BY relevance DESC, ib.created_at DESC
      LIMIT v_items_per_table_limit
    )
  ) results
  ORDER BY results.relevance DESC, results.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.global_semantic_search(
  team_id uuid,
  search_term text DEFAULT NULL,
  start_date text DEFAULT NULL,
  end_date text DEFAULT NULL,
  types text[] DEFAULT NULL,
  amount numeric DEFAULT NULL,
  amount_min numeric DEFAULT NULL,
  amount_max numeric DEFAULT NULL,
  status text DEFAULT NULL,
  currency text DEFAULT NULL,
  language text DEFAULT 'english',
  due_date_start text DEFAULT NULL,
  due_date_end text DEFAULT NULL,
  max_results integer DEFAULT 20,
  items_per_table_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  relevance real,
  created_at timestamp with time zone,
  data jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT gs.*
  FROM public.global_search(
    search_term,
    team_id,
    language,
    max_results,
    items_per_table_limit,
    0.0
  ) gs
  WHERE (types IS NULL OR gs.type = ANY(types))
    AND (
      status IS NULL
      OR gs.data->>'status' = status
    )
    AND (
      currency IS NULL
      OR gs.data->>'currency' = currency
    )
    AND (
      amount IS NULL
      OR NULLIF(gs.data->>'amount', '')::numeric = amount
      OR NULLIF(gs.data->>'price', '')::numeric = amount
    )
    AND (
      amount_min IS NULL
      OR NULLIF(COALESCE(gs.data->>'amount', gs.data->>'price'), '')::numeric >= amount_min
    )
    AND (
      amount_max IS NULL
      OR NULLIF(COALESCE(gs.data->>'amount', gs.data->>'price'), '')::numeric <= amount_max
    )
  LIMIT COALESCE(max_results, 20);
$$;
