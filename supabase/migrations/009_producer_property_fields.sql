-- ============================================================
-- Plataforma ATER — Migration 009: Campos expandidos de
-- produtores e propriedades
-- ============================================================

-- ── Produtores ────────────────────────────────────────────────
ALTER TABLE public.producers
  ADD COLUMN IF NOT EXISTS cpf_cnpj  text,
  ADD COLUMN IF NOT EXISTS sex       text CHECK (sex IN ('M', 'F', 'O', 'N')),
  ADD COLUMN IF NOT EXISTS state     text,
  ADD COLUMN IF NOT EXISTS city      text,
  ADD COLUMN IF NOT EXISTS locality  text,
  ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active', 'inactive'));

-- ── Propriedades ──────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS state   text,
  ADD COLUMN IF NOT EXISTS address text;

-- Índice para filtrar produtores por status
CREATE INDEX IF NOT EXISTS idx_producers_status
  ON public.producers(workspace_id, status);
