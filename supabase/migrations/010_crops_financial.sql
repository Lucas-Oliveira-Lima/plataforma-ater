-- ============================================================
-- Plataforma ATER — Migration 010: Culturas/Safras e Financeiro
-- ============================================================

-- ── Tabela crops ─────────────────────────────────────────────
CREATE TABLE public.crops (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  producer_id            uuid        NOT NULL REFERENCES public.producers(id)  ON DELETE CASCADE,
  property_id            uuid        REFERENCES public.properties(id) ON DELETE SET NULL,

  -- Identificação
  culture                text        NOT NULL,
  culture_variety        text,

  -- Período
  season_year            integer     NOT NULL,
  season_type            text        NOT NULL CHECK (season_type IN ('verao','inverno','anual','perene')),

  -- Área e plantio
  planted_area_ha        numeric,
  planted_at             date,
  expected_harvest_at    date,

  -- Resultado
  harvested_at           date,
  expected_yield_kg_ha   numeric,
  actual_yield_kg_ha     numeric,
  expected_production_kg numeric,
  actual_production_kg   numeric,
  sale_price_per_kg      numeric,

  -- Status
  status                 text        NOT NULL DEFAULT 'planejada'
                         CHECK (status IN ('planejada','em_andamento','colhida','perdida')),
  loss_reason            text,

  -- ── CAMPOS DE CACAU ──────────────────────────────────────
  area_cacau_producao_ha   numeric,
  area_cacau_declarada_ha  numeric,
  area_app_rl_ha           numeric,
  area_arrendada_ha        numeric,
  area_consorcio_ha        numeric,
  area_irrigada_ha         numeric,
  numero_talhoes           integer,
  numero_talhoes_arrendado integer,

  producao_ano_anterior_kg numeric,
  producao_ano_atual_kg    numeric,
  preco_medio_kg           numeric,

  sistema_producao         text,
  faz_fermentacao          text,
  tipo_fermentacao         text,
  material_genetico        text,

  -- Teto produtivo (calculado e persistido)
  nota_analise_tecnica     numeric,
  nota_boas_praticas       numeric,
  coeficiente_fazenda      numeric,
  teto_kg                  numeric,
  teto_kg_ha               numeric,

  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crops_workspace" ON public.crops
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

CREATE INDEX idx_crops_producer  ON public.crops(producer_id);
CREATE INDEX idx_crops_property  ON public.crops(property_id);
CREATE INDEX idx_crops_workspace ON public.crops(workspace_id, season_year, status);
CREATE INDEX idx_crops_culture   ON public.crops(workspace_id, culture);

-- ── Tabela visit_crops (N:N visita ↔ safra) ──────────────────
CREATE TABLE public.visit_crops (
  visit_id uuid NOT NULL REFERENCES public.visits(id)  ON DELETE CASCADE,
  crop_id  uuid NOT NULL REFERENCES public.crops(id)   ON DELETE CASCADE,
  PRIMARY KEY (visit_id, crop_id)
);

ALTER TABLE public.visit_crops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_crops_workspace" ON public.visit_crops
  FOR ALL USING (
    visit_id IN (SELECT id FROM public.visits WHERE workspace_id = public.get_user_workspace_id())
  );

-- ── Referências em tabelas existentes ────────────────────────
ALTER TABLE public.visit_records   ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL;

-- ── Tabela financial_records ──────────────────────────────────
CREATE TABLE public.financial_records (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid          NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  producer_id      uuid          NOT NULL REFERENCES public.producers(id)  ON DELETE CASCADE,
  property_id      uuid          REFERENCES public.properties(id) ON DELETE SET NULL,
  visit_id         uuid          REFERENCES public.visits(id)     ON DELETE SET NULL,
  crop_id          uuid          REFERENCES public.crops(id)      ON DELETE SET NULL,

  type             text          NOT NULL CHECK (type IN ('receita','despesa')),
  category         text          NOT NULL,
  subcategory      text,
  description      text,
  amount           numeric(12,2) NOT NULL,
  quantity         numeric,
  unit             text,

  reference_date   date          NOT NULL,
  reference_period text,

  is_baseline      boolean       DEFAULT false,
  notes            text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial_records_workspace" ON public.financial_records
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

CREATE INDEX idx_financial_producer ON public.financial_records(producer_id, reference_date);
CREATE INDEX idx_financial_visit    ON public.financial_records(visit_id);
CREATE INDEX idx_financial_crop     ON public.financial_records(crop_id);
CREATE INDEX idx_financial_type     ON public.financial_records(workspace_id, type, reference_date);
