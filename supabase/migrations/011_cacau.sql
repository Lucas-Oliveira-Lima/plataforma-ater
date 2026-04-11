-- ============================================================
-- Plataforma ATER — Migration 011: Módulo Cacau / CSCacau
-- ============================================================

-- ── Benchmark regional no workspace ──────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS cacau_benchmark_kg_ha numeric DEFAULT 847;

-- ── Tabela cacau_observacoes_tecnicas ─────────────────────────
-- Uma linha por visita de cacau. Checklist completo do campo.
CREATE TABLE public.cacau_observacoes_tecnicas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  visit_id     uuid NOT NULL REFERENCES public.visits(id)     ON DELETE CASCADE,
  crop_id      uuid NOT NULL REFERENCES public.crops(id)      ON DELETE CASCADE,

  -- ── Seção 3: Análise Técnica ──────────────────────────────
  areas_limpas_arejadas           text,
  areas_bem_adensadas             text,
  copas_bem_formadas              text,
  plantas_saudaveis               text,
  vassoura_bruxa_controlada       text,
  podridao_parda_controlada       text,

  -- ── Seção 4: Boas Práticas Agrícolas ─────────────────────
  idade_media_lavoura             text,
  espacamento_utilizado           text,
  faz_analise_solo_foliar         text,
  faz_correcao_solo               text,
  faz_adubacao_solo               text,
  faz_adubacao_foliar             text,
  faz_controle_fungico_preventivo text,
  faz_poda_manutencao             text,
  faz_poda_fitossanitaria         text,

  -- ── Seção 5: Agricultura Regenerativa ────────────────────
  usa_cultura_cobertura           text,
  usa_plantio_direto              text,
  usa_material_organico           text,
  tem_plano_adubacao              text,
  conserva_mata_ciliar            text,
  usa_cerca_viva                  text,
  adota_mip                       text,
  usa_agricultura_precisao        text,
  participa_acoes_comunitarias    text,
  faz_tratamento_casqueiro        text,

  -- ── Campos complementares ────────────────────────────────
  tem_irrigacao                   text,
  irrigacao_eficiente             text,
  faz_controle_biologico          text,
  usa_composto_organico           text,
  faz_renovacao_plantel           text,
  faz_coroamento                  text,
  controle_pragas_doencas         text,
  tem_viveiro                     text,
  organizacao_tecnologia          jsonb,

  -- ── Textos de recomendação (pares observado → recomendação) ──
  areas_limpas_recomendacao              text,
  areas_limpas_como_iniciar              text,
  areas_adensadas_recomendacao           text,
  areas_adensadas_como_iniciar           text,
  copas_formadas_recomendacao            text,
  copas_formadas_como_iniciar            text,
  plantas_saudaveis_recomendacao         text,
  plantas_saudaveis_como_iniciar         text,
  vassoura_bruxa_recomendacao            text,
  vassoura_bruxa_como_iniciar            text,
  podridao_parda_recomendacao            text,
  podridao_parda_como_iniciar            text,

  -- Boas práticas
  analise_solo_recomendacao              text,
  correcao_solo_recomendacao             text,
  adubacao_solo_recomendacao             text,
  adubacao_foliar_recomendacao           text,
  controle_fungico_recomendacao          text,
  poda_manutencao_recomendacao           text,
  poda_fitossanitaria_recomendacao       text,

  -- Agricultura regenerativa
  cultura_cobertura_recomendacao         text,
  plantio_direto_recomendacao            text,
  material_organico_recomendacao         text,
  plano_adubacao_recomendacao            text,
  mata_ciliar_recomendacao               text,
  cerca_viva_recomendacao                text,
  mip_recomendacao                       text,
  agricultura_precisao_recomendacao      text,
  acoes_comunitarias_recomendacao        text,
  casqueiro_recomendacao                 text,

  -- ── Análises narrativas por seção ────────────────────────
  analise_tecnica_areas_cacau            text,
  analise_boas_praticas                  text,
  analise_recomendacoes_proximo_ano      text,
  analise_agricultura_regenerativa       text,
  avaliacao_teto_produtivo               text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (visit_id)
);

ALTER TABLE public.cacau_observacoes_tecnicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cacau_obs_workspace" ON public.cacau_observacoes_tecnicas
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

CREATE INDEX idx_cacau_obs_visit ON public.cacau_observacoes_tecnicas(visit_id);
CREATE INDEX idx_cacau_obs_crop  ON public.cacau_observacoes_tecnicas(crop_id);
