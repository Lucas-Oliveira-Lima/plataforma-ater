-- ============================================================
-- Plataforma ATER — Migration 012: Campos complementares
-- ============================================================

-- ── Visitas ───────────────────────────────────────────────────
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS cycle_number              integer,
  ADD COLUMN IF NOT EXISTS producer_rating_score     integer CHECK (producer_rating_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS preferred_visit_frequency text    CHECK (preferred_visit_frequency IN ('mensal','bimestral','trimestral','semestral')),
  ADD COLUMN IF NOT EXISTS pda_generated_at          timestamptz;

-- ── Produtores ────────────────────────────────────────────────
-- UUID de vínculo com o formulário Kobo (pulldata produtores.csv)
ALTER TABLE public.producers
  ADD COLUMN IF NOT EXISTS kobo_uuid text UNIQUE;

-- Índice para busca por ciclo de visita
CREATE INDEX IF NOT EXISTS idx_visits_cycle ON public.visits(workspace_id, cycle_number);
