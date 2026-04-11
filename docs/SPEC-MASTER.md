# Plataforma ATER — Especificação Técnica Mestre
## Módulos: Culturas/Safras · Financeiro · Cacau/Cargill · Laudo PDA

**Versão:** 1.0 — Abril 2025  
**Projeto-piloto:** Cargill / CocoaAction Brasil — Pará  
**Para:** Claude Code — leia este documento inteiro antes de escrever qualquer linha

---

## ÍNDICE DE IMPLEMENTAÇÃO (ordem obrigatória)

```
FASE 1 — Banco de dados (migrations)
  1.1  crops + visit_crops + referências em visit_records/recommendations
  1.2  financial_records
  1.3  cacau_observacoes_tecnicas
  1.4  workspaces.cacau_benchmark_kg_ha

FASE 2 — Offline/sync (Dexie + sync-engine)
  2.1  Adicionar todas as novas tabelas ao IndexedDB
  2.2  Adicionar à SYNCABLE_TABLES

FASE 3 — UI (componentes e páginas)
  3.1  producers/[id] → aba "Culturas e Safras"
  3.2  visits/[id] → seção "Safras abordadas"
  3.3  visits/[id] → seção "Financeiro"
  3.4  visits/[id] → seção "Cacau" (condicional: culture = 'cacau')
  3.5  crops/[id] → detalhe da safra com financeiro

FASE 4 — Geração de documentos
  4.1  generate-pda.ts — Laudo PDA Word/PDF
  4.2  export-excel.ts — novas abas

FASE 5 — Painel admin
  5.1  Indicadores financeiros
  5.2  Indicadores de cacau / CSCacau
```

---

# PARTE 1 — MÓDULO DE CULTURAS E SAFRAS

## 1.1 Por que este módulo existe

Sem registros de safra estruturados, as visitas ficam soltas no tempo e é impossível responder: "o produtor aumentou produtividade após X visitas?". O módulo registra **o que o produtor planta, quando, em que área, o que esperava colher e o que colheu**, vinculando esse ciclo às visitas.

## 1.2 Modelo de dados

### Tabela `crops`

```sql
CREATE TABLE public.crops (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  producer_id            uuid        NOT NULL REFERENCES producers(id)  ON DELETE CASCADE,
  property_id            uuid        REFERENCES properties(id) ON DELETE SET NULL,

  -- Identificação
  culture                text        NOT NULL,  -- 'cacau', 'soja', 'milho', 'cafe', 'feijao', 'arroz', 'banana', 'mandioca', etc.
  culture_variety        text,                  -- Variedade/híbrido. Para cacau: 'cacau_comum', 'hibrido_ceplac', 'multiclonal'

  -- Período
  season_year            integer     NOT NULL,  -- Ano de referência
  season_type            text        NOT NULL   CHECK (season_type IN ('verao','inverno','anual','perene')),

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

  -- ── CAMPOS EXCLUSIVOS DE CACAU ─────────────────────────────────────────────
  -- Adicionar apenas quando culture = 'cacau'. Null para outras culturas.

  -- Áreas detalhadas
  area_cacau_producao_ha   numeric,   -- área em produção (≠ área total declarada)
  area_cacau_declarada_ha  numeric,   -- total declarado pelo produtor
  area_app_rl_ha           numeric,   -- APP + Reserva Legal
  area_arrendada_ha        numeric,   -- arrendada/meeiro
  area_consorcio_ha        numeric,   -- em sistema consorciado
  area_irrigada_ha         numeric,   -- com irrigação
  numero_talhoes           integer,
  numero_talhoes_arrendado integer,

  -- Produção e preço (específico cacau — ciclo anual dentro de perene)
  producao_ano_anterior_kg numeric,   -- produção real do ano anterior
  producao_ano_atual_kg    numeric,   -- estimativa ano atual
  preco_medio_kg           numeric,   -- preço médio estimado R$/kg

  -- Caracterização da lavoura
  sistema_producao         text,      -- 'cacau_consorcio','cacau_saf','cacau_monocultivo','cacau_cabruca'
  faz_fermentacao          text,      -- 'sim_fermenta_todo_cacau','parcialmente','nao'
  tipo_fermentacao         text,      -- 'basica','completa'

  -- Teto produtivo (calculado e persistido)
  nota_analise_tecnica     numeric,   -- score 0–10, média das 6 obs. técnicas
  nota_boas_praticas       numeric,   -- score 0–10, média ponderada das 9 práticas
  coeficiente_fazenda      numeric,   -- (nota_analise_tecnica + nota_boas_praticas) / 2 / 10
  teto_kg                  numeric,   -- coeficiente × area_cacau_producao_ha × benchmark_kg_ha
  teto_kg_ha               numeric,   -- teto_kg ÷ area_cacau_producao_ha
  -- ── FIM CAMPOS CACAU ───────────────────────────────────────────────────────

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
```

### Tabela `visit_crops` (N:N visita ↔ safra)

```sql
CREATE TABLE public.visit_crops (
  visit_id uuid NOT NULL REFERENCES visits(id)  ON DELETE CASCADE,
  crop_id  uuid NOT NULL REFERENCES crops(id)   ON DELETE CASCADE,
  PRIMARY KEY (visit_id, crop_id)
);

ALTER TABLE public.visit_crops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_crops_workspace" ON public.visit_crops
  FOR ALL USING (
    visit_id IN (SELECT id FROM visits WHERE workspace_id = public.get_user_workspace_id())
  );
```

### Referências em tabelas existentes

```sql
ALTER TABLE public.visit_records   ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES crops(id) ON DELETE SET NULL;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES crops(id) ON DELETE SET NULL;
```

## 1.3 Comportamento de cacau como cultura perene

| Campo genérico | Comportamento no cacau |
|---|---|
| `season_type` | Sempre `'perene'` |
| `planted_at` | Data de plantio da lavoura (pode ser décadas atrás) |
| `expected_harvest_at` | Não se aplica — colheita é contínua |
| `harvested_at` | Fecha o **ano agrícola**, não uma colheita específica |
| `actual_yield_kg_ha` | `producao_ano_anterior_kg ÷ area_cacau_producao_ha` |
| `expected_yield_kg_ha` | `producao_ano_atual_kg ÷ area_cacau_producao_ha` |
| `status` | `'em_andamento'` permanentemente enquanto a lavoura existe |
| `planted_area_ha` | Usar `area_cacau_producao_ha` como campo principal |

## 1.4 Regras de negócio — culturas

| # | Regra |
|---|---|
| RN-C01 | Campos mínimos obrigatórios: `culture`, `season_year`, `season_type`, `producer_id` |
| RN-C02 | `planted_area_ha` não pode exceder `properties.total_area_ha` — validação leve (aviso, não bloqueio) |
| RN-C03 | Transições de status válidas: `planejada → em_andamento → colhida / perdida`. Não retrocede. |
| RN-C04 | `actual_yield_kg_ha` e `actual_production_kg` só preenchíveis com `status = 'colhida'` |
| RN-C05 | Safra `em_andamento` com `expected_harvest_at` vencida → alerta visual |
| RN-C06 | `loss_reason` obrigatório quando `status = 'perdida'` |
| RN-C07 | Dois crops com mesma `culture + property_id + season_year + season_type` → aviso de duplicidade |
| RN-C08 | Crop de cacau: `season_type` forçado para `'perene'`, `status` inicia como `'em_andamento'` |

## 1.5 Indicadores calculados — culturas

| Indicador | Fórmula |
|---|---|
| Produtividade real | `actual_production_kg ÷ planted_area_ha` |
| Taxa de atingimento de meta | `actual_yield_kg_ha ÷ expected_yield_kg_ha` |
| Evolução temporal | `actual_yield_kg_ha` safra 1 vs safra N |
| Área total cultivada/ano | `SUM(planted_area_ha)` por `producer_id + season_year` |

---

# PARTE 2 — MÓDULO FINANCEIRO

## 2.1 O que é e o que não é

**É:** registro de receitas e despesas agrícolas autodeclaradas pelo produtor durante a visita, para medir evolução econômica ao longo do projeto.  
**Não é:** contabilidade, substituto de notas fiscais, ou cálculo de impostos.

## 2.2 Modelo de dados

### Tabela `financial_records`

```sql
CREATE TABLE public.financial_records (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  producer_id      uuid          NOT NULL REFERENCES producers(id)  ON DELETE CASCADE,
  property_id      uuid          REFERENCES properties(id) ON DELETE SET NULL,
  visit_id         uuid          REFERENCES visits(id)     ON DELETE SET NULL,
  crop_id          uuid          REFERENCES crops(id)      ON DELETE SET NULL,

  type             text          NOT NULL CHECK (type IN ('receita','despesa')),
  category         text          NOT NULL,      -- ver seção 2.3
  subcategory      text,                        -- para cacau: código específico (ver seção 2.4)
  description      text,                        -- detalhe livre: "Herbicida Roundup 20L"
  amount           numeric(12,2) NOT NULL,      -- valor positivo em R$
  quantity         numeric,
  unit             text,                        -- 'L','kg','sc','h','diária','t'

  reference_date   date          NOT NULL,      -- quando ocorreu o fato (≠ data da visita)
  reference_period text,                        -- label: "Ano agrícola 2024" / "Jan 2025"

  is_baseline      boolean       DEFAULT false, -- true = dado pré-projeto (linha de base)
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
```

## 2.3 Categorias genéricas (todas as culturas)

### Despesas

| Código | Label | Exemplos |
|---|---|---|
| `sementes` | Sementes e mudas | Semente certificada, muda de café |
| `fertilizantes` | Fertilizantes e corretivos | NPK, ureia, calcário, gesso |
| `defensivos` | Agroquímicos / Defensivos | Herbicida, fungicida, inseticida |
| `mao_obra` | Mão de obra | Diária, empreitada, encargos |
| `mecanizacao` | Mecanização | Trator, colheitadeira, plantadeira |
| `arrendamento` | Arrendamento de terra | Aluguel de área, parceria |
| `energia` | Energia e combustível | Diesel, energia elétrica |
| `irrigacao` | Irrigação | Manutenção de sistema, energia |
| `transporte` | Transporte e fretes | Frete de insumos, produção |
| `assistencia_tecnica` | Assistência técnica | Laudos, análises de solo |
| `outros_custos` | Outros custos | Embalagens, armazenagem, taxas |

### Receitas

| Código | Label | Exemplos |
|---|---|---|
| `venda_producao` | Venda da produção principal | Cacau 2000kg × R$8,50 |
| `venda_subproduto` | Venda de subprodutos | Palha, silagem |
| `venda_animal` | Venda de animais | Boi gordo, suíno |
| `paa_pnae` | Compras institucionais | PAA, PNAE |
| `seguro_sinistro` | Seguro agrícola | Proagro, indenização |
| `subsidio` | Subsídio / apoio governamental | Pronaf recebido |
| `servicos` | Prestação de serviços | Arrendamento cedido |
| `outros_receitas` | Outras receitas | |

## 2.4 Subcategorias específicas de cacau

Quando `crop.culture = 'cacau'`, o campo `subcategory` usa os códigos abaixo. A `category` pai permanece da lista genérica.

### Insumos (despesas)

| Subcategoria | Label | Category pai |
|---|---|---|
| `mudas_hastes` | Mudas e/ou hastes | `sementes` |
| `calcario` | Calcário | `fertilizantes` |
| `adubos` | Adubos | `fertilizantes` |
| `herbicidas` | Herbicidas | `defensivos` |
| `inseticidas` | Inseticidas | `defensivos` |
| `fungicidas` | Fungicidas | `defensivos` |
| `energia_eletrica` | Energia elétrica | `energia` |
| `combustivel` | Combustível | `energia` |
| `irrigacao_insumo` | Irrigação (insumo) | `irrigacao` |

### Serviços (despesas — mão de obra e mecanização)

| Subcategoria | Label |
|---|---|
| `aracao` | Aração |
| `gradagem` | Gradagem |
| `sulcamento` | Sulcamento |
| `marcacao_covas` | Marcação de covas |
| `abertura_covas` | Abertura de covas |
| `enchimento_adubacao_covas` | Enchimento/adubação de covas |
| `plantio_mudas` | Plantio de mudas |
| `replantio` | Replantio |
| `coroamento` | Coroamento |
| `rocagem_trator` | Roçagem (trator) |
| `combate_pragas` | Combate de pragas |
| `poda_formacao` | Poda de formação |
| `poda_manutencao_serv` | Poda de manutenção |
| `poda_fitossanitaria_serv` | Poda fitossanitária |
| `desbrota` | Desbrota |
| `aplicacao_defensivos_mip` | Aplicação de defensivos (MIP) |
| `irrigacao_servico` | Irrigação (serviço) |
| `fertirrigacao` | Fertiirrigação |
| `colheita` | Colheita |
| `embandeiramento` | Embandeiramento |
| `abertura_frutos` | Abertura de frutos |
| `fermentacao_serv` | Fermentação |
| `secagem` | Secagem |
| `armazenagem` | Armazenagem |
| `transporte_producao` | Transporte da produção |

## 2.5 Regras de negócio — financeiro

| # | Regra |
|---|---|
| RN-F01 | `amount` sempre positivo — o sinal vem do `type` |
| RN-F02 | `reference_date` não pode ser futuro |
| RN-F03 | Se `crop_id` informado, `producer_id` do record deve coincidir com o do crop |
| RN-F04 | Excluir visita → `visit_id` vira NULL (ON DELETE SET NULL), registro permanece |
| RN-F05 | `quantity` + `unit` são opcionais mas recomendados para insumos (calcula custo unitário) |
| RN-F06 | Ao encerrar safra (`status = 'colhida'`), exibir resumo financeiro automaticamente |
| RN-F07 | UI deve deixar explícito que dados são autodeclarados — no formulário e nos relatórios |
| RN-F08 | `is_baseline = true` marca dados pré-projeto (linha de base para comparação futura) |

## 2.6 Indicadores calculados — financeiro

| Indicador | Fórmula | Unidade |
|---|---|---|
| Receita bruta por safra | `SUM(amount) WHERE type='receita' AND crop_id=X` | R$ |
| Custo total por safra | `SUM(amount) WHERE type='despesa' AND crop_id=X` | R$ |
| Margem de contribuição | Receita bruta − Custo variável total | R$ |
| Custo de produção unitário | Custo total ÷ `actual_production_kg` | R$/kg |
| Ponto de equilíbrio | Custo total ÷ `sale_price_per_kg` | kg |
| Evolução da margem | (Margem safra N − Margem safra 1) ÷ Margem safra 1 | % |
| Receita por ha | Receita bruta ÷ `planted_area_ha` | R$/ha |
| Fluxo de caixa mensal | `SUM(amount)` agrupado por mês de `reference_date` | R$/mês |

---

# PARTE 3 — MÓDULO CACAU / CARGILL / CSCACAU

## 3.1 Contexto do projeto

Projeto **Cargill / CocoaAction Brasil** de ATER para cacauicultores no Pará. Municípios: Altamira, Anapu, Brasil Novo, Medicilândia, Pacajá, Placas, Uruará e Vitória do Xingu.

**Referência normativa:** Currículo de Sustentabilidade do Cacau (CSCacau 2021), reconhecido pelo MAPA via Portaria nº 337. Três eixos: Gestão da Produção (1.x), Gestão Ambiental (2.x), Gestão Social (3.x).

**Fluxo de trabalho:**
1. Diagnóstico inicial (formulário Kobo — uma vez por produtor)
2. Visitas de acompanhamento — 1ª a 10ª (formulário Kobo de visita técnica de cacau)
3. Laudo PDA gerado automaticamente após cada visita

## 3.2 Nova tabela: `cacau_observacoes_tecnicas`

Uma linha por visita de cacau. Armazena o checklist completo do formulário de campo.

```sql
CREATE TABLE public.cacau_observacoes_tecnicas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visit_id     uuid NOT NULL REFERENCES visits(id)     ON DELETE CASCADE,
  crop_id      uuid NOT NULL REFERENCES crops(id)      ON DELETE CASCADE,

  -- ── SEÇÃO 3 DO LAUDO PDA: Análise Técnica ─────────────────────────
  -- Valores aceitos: 'sim' | 'parcialmente' | 'nao'
  areas_limpas_arejadas           text,   -- áreas de produção limpas e arejadas
  areas_bem_adensadas             text,   -- áreas com densidade adequada de plantas
  copas_bem_formadas              text,   -- copas baixas e desentrelaçadas
  plantas_saudaveis               text,   -- sem deficiência de nutrientes
  vassoura_bruxa_controlada       text,   -- Moniliophthora perniciosa controlada
  podridao_parda_controlada       text,   -- Phytophthora palmivora controlada

  -- ── SEÇÃO 4 DO LAUDO PDA: Boas Práticas Agrícolas ────────────────
  idade_media_lavoura             text,   -- '0_10'|'10_20'|'20_30'|'30_40'|'_40' (anos)
  espacamento_utilizado           text,   -- '3x3'|'3x3_50'|'4x4'|'4x5'|outros
  faz_analise_solo_foliar         text,   -- 'nao'|'sim_anualmente'|'sim_bianualmente'|'sim_esporadicamente'
  faz_correcao_solo               text,   -- 'sim'|'sim_em_parte_da_area'|'nao'
  faz_adubacao_solo               text,   -- 'nao'|'sim_anualmente'|'sim_bianualmente'|'sim_esporadicamente'
  faz_adubacao_foliar             text,   -- igual adubacao_solo
  faz_controle_fungico_preventivo text,   -- 'sim'|'parcialmente'|'nao'
  faz_poda_manutencao             text,   -- 'simm_anualmente'|'sim_bianualmente'|'sim_esporadicamente'|'nao'
  faz_poda_fitossanitaria         text,   -- igual poda_manutencao

  -- ── SEÇÃO 5 DO LAUDO PDA: Agricultura Regenerativa ───────────────
  -- Valores aceitos: 'sim' | 'parcialmente' | 'nao' (exceto onde indicado)
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

  -- ── CAMPOS COMPLEMENTARES (do formulário Kobo de visita) ─────────
  tem_irrigacao                   text,
  irrigacao_eficiente             text,
  faz_controle_biologico          text,
  usa_composto_organico           text,
  faz_renovacao_plantel           text,
  faz_coroamento                  text,
  controle_pragas_doencas         text,  -- múltiplos: 'controle_quimico','controle_biologico','nao_controla'
  tem_viveiro                     text,
  organizacao_tecnologia          jsonb, -- array de equipamentos disponíveis

  -- ── TEXTOS NARRATIVOS (gerados por IA ou editados pelo técnico) ──
  -- Textos de recomendação e análise que aparecem no Laudo PDA

  -- Recomendações por prática (pares: observado → recomendação)
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

  -- Recomendações de boas práticas
  analise_solo_recomendacao              text,
  correcao_solo_recomendacao             text,
  adubacao_solo_recomendacao             text,
  adubacao_foliar_recomendacao           text,
  controle_fungico_recomendacao          text,
  poda_manutencao_recomendacao           text,
  poda_fitossanitaria_recomendacao       text,

  -- Recomendações de agricultura regenerativa
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

  -- Análises narrativas por seção (parágrafos completos)
  analise_tecnica_areas_cacau            text,  -- parágrafo da seção 3
  analise_boas_praticas                  text,  -- parágrafo da seção 4
  analise_recomendacoes_proximo_ano      text,  -- parágrafo da seção 4.1
  analise_agricultura_regenerativa       text,  -- parágrafo da seção 5
  avaliacao_teto_produtivo               text,  -- parágrafo da seção 7

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (visit_id) -- exatamente uma linha por visita
);

ALTER TABLE public.cacau_observacoes_tecnicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cacau_obs_workspace" ON public.cacau_observacoes_tecnicas
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

CREATE INDEX idx_cacau_obs_visit ON public.cacau_observacoes_tecnicas(visit_id);
CREATE INDEX idx_cacau_obs_crop  ON public.cacau_observacoes_tecnicas(crop_id);
```

## 3.3 Benchmark regional — workspace

```sql
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS cacau_benchmark_kg_ha numeric DEFAULT 847;
-- Fonte: SEDAP/CEPLAC/Funcacau — Relatório Anual Safra Cacau Pará 2024
```

## 3.4 Cálculo do teto produtivo

Persistir os valores calculados em `crops` (não recalcular a cada leitura).

### Score: `nota_analise_tecnica` (0–10)

Média simples das 6 observações técnicas.

| Valor | Pontos |
|---|---|
| `'sim'` | 10 |
| `'parcialmente'` | 5 |
| `'nao'` | 0 |

```typescript
function calcNotaAnaliseTecnica(obs: CacauObservacoesTecnicas): number {
  const campos = [
    obs.areas_limpas_arejadas,
    obs.areas_bem_adensadas,
    obs.copas_bem_formadas,
    obs.plantas_saudaveis,
    obs.vassoura_bruxa_controlada,
    obs.podridao_parda_controlada,
  ];
  const score = (v: string | null) =>
    v === 'sim' ? 10 : v === 'parcialmente' ? 5 : 0;
  const preenchidos = campos.filter(c => c !== null && c !== undefined);
  if (preenchidos.length === 0) return 0;
  return preenchidos.reduce((sum, c) => sum + score(c), 0) / preenchidos.length;
}
```

### Score: `nota_boas_praticas` (0–10)

Média ponderada das 9 práticas agrícolas.

```typescript
function scoreFrequencia(v: string | null): number {
  if (!v) return 0;
  if (v.includes('anualmente'))    return 10;
  if (v.includes('bianualmente'))  return 7;
  if (v.includes('esporadicamente')) return 4;
  if (v === 'sim')                 return 10;
  if (v === 'parcialmente' || v.includes('em_parte')) return 5;
  return 0;
}

function calcNotaBoasPraticas(obs: CacauObservacoesTecnicas): number {
  // [score, peso]
  const praticas: [number, number][] = [
    [scoreFrequencia(obs.faz_analise_solo_foliar),         2],
    [scoreFrequencia(obs.faz_correcao_solo),               1],
    [scoreFrequencia(obs.faz_adubacao_solo),               2],
    [scoreFrequencia(obs.faz_adubacao_foliar),             1],
    [scoreFrequencia(obs.faz_controle_fungico_preventivo), 2],
    [scoreFrequencia(obs.faz_poda_manutencao),             1],
    [scoreFrequencia(obs.faz_poda_fitossanitaria),         1],
  ];
  const totalPeso  = praticas.reduce((s, [, p]) => s + p, 0);
  const totalScore = praticas.reduce((s, [sc, p]) => s + sc * p, 0);
  return totalScore / totalPeso;
}
```

### Teto produtivo

```typescript
function calcTetoProdutivo(
  crop: Crop,
  obs: CacauObservacoesTecnicas,
  benchmarkKgHa: number  // default: 847
) {
  const nota_analise_tecnica = calcNotaAnaliseTecnica(obs);
  const nota_boas_praticas   = calcNotaBoasPraticas(obs);
  const coeficiente_fazenda  = (nota_analise_tecnica + nota_boas_praticas) / 2 / 10;
  const area                 = crop.area_cacau_producao_ha ?? crop.planted_area_ha ?? 0;
  const teto_kg              = coeficiente_fazenda * area * benchmarkKgHa;
  const teto_kg_ha           = area > 0 ? teto_kg / area : 0;

  return { nota_analise_tecnica, nota_boas_praticas, coeficiente_fazenda, teto_kg, teto_kg_ha };
}
```

Persistir esses valores em `crops` após salvar `cacau_observacoes_tecnicas`.

## 3.5 Setores ATER para recomendações (cacau)

Quando `crop.culture = 'cacau'`, usar estas categorias no campo `recommendations.category`:

| Código | Label |
|---|---|
| `recuperacao_solo` | Recuperação do Solo |
| `fitossanidade` | Fitossanidade |
| `adubacao` | Adubação |
| `producao_produtividade` | Produção e Produtividade |
| `verticalizacao_producao` | Verticalização da Produção |
| `diversificacao_safs` | Diversificação da Produção e SAFs |
| `gestao_propriedade` | Gestão da Propriedade Rural |
| `sustentabilidade_cacau` | Sustentabilidade do Cacau |
| `direitos_humanos` | Direitos Humanos |

## 3.6 Indicadores específicos do projeto Cargill

| Indicador | Fórmula | Unidade |
|---|---|---|
| Produtividade real | `producao_ano_anterior_kg ÷ area_cacau_producao_ha` | kg/ha |
| Gap vs benchmark | `(847 − produtividade_real) ÷ 847` | % abaixo da média |
| Teto produtivo (kg) | `coeficiente_fazenda × area × benchmark` | kg |
| Potencial de crescimento | `(teto_kg − producao_ano_anterior_kg) ÷ producao_ano_anterior_kg` | % |
| Score CSCacau | `(nota_analise_tecnica + nota_boas_praticas) / 2` | 0–10 |
| Evolução do score | Score visita N − Score visita 1 | pontos |
| Adoção de práticas | nº práticas com score ≥ 7 ÷ total | % |
| Receita estimada | `producao_ano_anterior_kg × preco_medio_kg` | R$ |
| Custo de produção | `Σ despesas cacau ÷ producao_ano_anterior_kg` | R$/kg |

---

# PARTE 4 — LAUDO PDA

## 4.1 O que é

Documento Word/PDF entregue ao produtor após cada visita de cacau. Consolida dados técnicos, calcula teto produtivo e apresenta recomendações. Substituiu o merge de variáveis `${...}` do KoboToolbox.

## 4.2 Estrutura do documento (seção por seção)

### Seção 1 — Cabeçalho / Identificação

```
Fazenda:         properties.name
Proprietário:    producers.name
Município:       producers.city  (/PA)
Estado:          Pará
Data de emissão: visits.visited_at (formato: "Mês de AAAA")
```

### Seção 2 — Entendendo o PDA

Texto fixo. Incluir 3 fotos da visita (primeiras fotos disponíveis em `recommendations[].photo_url`).

### Seção 3 — Análise Técnica das Áreas de Cacau

Tabela: **O que foi observado** | **Avaliação**

| Observação | Campo |
|---|---|
| Áreas de produção estão limpas e arejadas? | `cacau_obs.areas_limpas_arejadas` |
| Áreas estão bem adensadas? | `cacau_obs.areas_bem_adensadas` |
| Copas bem formadas, baixas e desentrelaçadas? | `cacau_obs.copas_bem_formadas` |
| Plantas saudáveis / sem deficiência de nutrientes? | `cacau_obs.plantas_saudaveis` |
| Vassoura de Bruxa bem controlada? | `cacau_obs.vassoura_bruxa_controlada` |
| Podridão Parda bem controlada? | `cacau_obs.podridao_parda_controlada` |

Seguido do parágrafo: `cacau_obs.analise_tecnica_areas_cacau`

### Seção 4 — Boas Práticas Agrícolas

Tabela: **Prática** | **Observado** | **Benefícios e Recomendações**

| Prática | Campo | Recomendação |
|---|---|---|
| Idade média da lavoura | `cacau_obs.idade_media_lavoura` | `cacau_obs.analise_solo_recomendacao` (adaptado) |
| Espaçamento | `cacau_obs.espacamento_utilizado` | — |
| Análise de solo/foliar | `cacau_obs.faz_analise_solo_foliar` | `cacau_obs.analise_solo_recomendacao` |
| Correção do solo | `cacau_obs.faz_correcao_solo` | `cacau_obs.correcao_solo_recomendacao` |
| Adubação de solo | `cacau_obs.faz_adubacao_solo` | `cacau_obs.adubacao_solo_recomendacao` |
| Adubação foliar | `cacau_obs.faz_adubacao_foliar` | `cacau_obs.adubacao_foliar_recomendacao` |
| Controle Fúngico preventivo | `cacau_obs.faz_controle_fungico_preventivo` | `cacau_obs.controle_fungico_recomendacao` |
| Poda de Manutenção | `cacau_obs.faz_poda_manutencao` | `cacau_obs.poda_manutencao_recomendacao` |
| Poda Fitossanitária | `cacau_obs.faz_poda_fitossanitaria` | `cacau_obs.poda_fitossanitaria_recomendacao` |

Seguido de: `cacau_obs.analise_boas_praticas`

#### Subseção 4.1 — Recomendações de melhorias para o próximo ano

Tabela: **Necessidade de mudança** | **Desenvolve?** | **Como iniciar**

| Necessidade | Observado | Como iniciar |
|---|---|---|
| Limpeza e Arejamento das áreas | `cacau_obs.areas_limpas_arejadas` | `cacau_obs.areas_limpas_como_iniciar` |
| Adensamento | `cacau_obs.areas_bem_adensadas` | `cacau_obs.areas_adensadas_como_iniciar` |
| Formação das plantas | `cacau_obs.copas_bem_formadas` | `cacau_obs.copas_formadas_como_iniciar` |
| Saúde das plantas | `cacau_obs.plantas_saudaveis` | `cacau_obs.plantas_saudaveis_como_iniciar` |
| Controle Vassoura de bruxa | `cacau_obs.vassoura_bruxa_controlada` | `cacau_obs.vassoura_bruxa_como_iniciar` |
| Controle Podridão Parda | `cacau_obs.podridao_parda_controlada` | `cacau_obs.podridao_parda_como_iniciar` |

Seguido de: `cacau_obs.analise_recomendacoes_proximo_ano`

### Seção 5 — Agricultura Regenerativa

Texto introdutório fixo (copiar do template V5).

Tabela: **Estratégia** | **Observado** | **Benefícios e Recomendações**

| Estratégia | Campo | Recomendação |
|---|---|---|
| Cobertura em linha | `cacau_obs.usa_cultura_cobertura` | `cacau_obs.cultura_cobertura_recomendacao` |
| Revolvimento mínimo do solo | `cacau_obs.usa_plantio_direto` | `cacau_obs.plantio_direto_recomendacao` |
| Fertilizante orgânico | `cacau_obs.usa_material_organico` | `cacau_obs.material_organico_recomendacao` |
| Recomendação de adubação | `cacau_obs.tem_plano_adubacao` | `cacau_obs.plano_adubacao_recomendacao` |
| Conservação de mata ciliar | `cacau_obs.conserva_mata_ciliar` | `cacau_obs.mata_ciliar_recomendacao` |
| Cerca Viva | `cacau_obs.usa_cerca_viva` | `cacau_obs.cerca_viva_recomendacao` |
| Manejo de Pragas e doenças (MIP) | `cacau_obs.adota_mip` | `cacau_obs.mip_recomendacao` |
| Agricultura de Precisão | `cacau_obs.usa_agricultura_precisao` | `cacau_obs.agricultura_precisao_recomendacao` |
| Ações comunitárias para proteção dos recursos | `cacau_obs.participa_acoes_comunitarias` | `cacau_obs.acoes_comunitarias_recomendacao` |
| Tratamento do casqueiro | `cacau_obs.faz_tratamento_casqueiro` | `cacau_obs.casqueiro_recomendacao` |

Seguido de: `cacau_obs.analise_agricultura_regenerativa`

### Seção 6 — Quadro de Áreas *(dados autodeclarados — ver nota 1)*

```
Sistema de Produção Predominante:    crops.sistema_producao
Área total da propriedade (ha):      properties.total_area_ha
Área de cacau total declarada (ha):  crops.area_cacau_declarada_ha
Área de cacau produtivo (ha):        crops.area_cacau_producao_ha
Número de talhões produtivos:        crops.numero_talhoes
Área arrendada (ha):                 crops.area_arrendada_ha
Número de talhões arrendados:        crops.numero_talhoes_arrendado
Área em consórcio (ha):              crops.area_consorcio_ha
Área irrigada (ha):                  crops.area_irrigada_ha
Produção da última safra:            crops.producao_ano_anterior_kg
```

### Seção 7 — Estimativa de Teto Produtivo *(ver nota 2)*

Tabela de scores:

| Item Avaliado | Avaliação |
|---|---|
| Análise técnica da Lavoura | `crops.nota_analise_tecnica` |
| Adoção das Boas Práticas Agrícolas | `crops.nota_boas_praticas` |
| Coeficiente da Fazenda | `crops.coeficiente_fazenda` |

Tabela de resultado:

| Teto produtivo = Coeficiente × Área × Produtividade regional (847 kg/ha) | Kg | Kg/ha |
|---|---|---|
| | `crops.teto_kg` | `crops.teto_kg_ha` |

Seguido de: `cacau_obs.avaliacao_teto_produtivo`

### Seção 8 — Ficha de Recomendação Técnica

Um bloco por setor ATER presente em `recommendations` da visita. Agrupar por `category`, exibir `recommendation_text` de cada registro.

Os 9 setores (em ordem): Recuperação do Solo · Fitossanidade da Lavoura · Produção / Produtividade · Adubação · Verticalização da Produção · Diversificação e SAFs · Gestão da Propriedade Rural · Sustentabilidade · Direitos Humanos.

### Seção 9 — Gestão de Custos Mensal

Duas tabelas (Insumos e Serviços) com os 25 itens listados na Parte 2, seção 2.4.  
Fonte: `financial_records WHERE crop_id = ? AND type = 'despesa'`, agrupado por `subcategory`.

### Seção 10 — Fluxo de Caixa

Tabela 12 meses: **Mês** | **Receitas** | **Custos** | **Lucro**

```sql
SELECT
  EXTRACT(month FROM reference_date) AS mes,
  SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) AS receitas,
  SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) AS custos,
  SUM(CASE WHEN type = 'receita' THEN amount ELSE -amount END) AS lucro
FROM financial_records
WHERE crop_id = :cacau_crop_id
  AND EXTRACT(year FROM reference_date) = :ano
GROUP BY mes
ORDER BY mes;
```

## 4.3 Notas de rodapé obrigatórias no documento

**Nota 1** (seção 6):
> As informações apresentadas nesta seção são de responsabilidade exclusiva dos/as produtores/as entrevistados/as. Elas refletem suas experiências, percepções e pontos de vista pessoais, e não necessariamente representam a posição oficial dos organizadores, veículos de mídia ou demais envolvidos na produção deste conteúdo. Dados mencionados devem ser considerados como relatos informais, sujeitos à verificação independente.

**Nota 2** (seção 7):
> O valor utilizado como referência para a produtividade regional é de 847 kg/ha, disponibilizado no Relatório Anual da safra de cacau no estado do Pará para o ano de 2024. Esse Relatório faz parte do projeto "Previsão de Safra de Cacau no Estado do Pará", tendo como responsável a Secretaria de Estado de Desenvolvimento Agropecuário e da Pesca (Sedap), com a interveniência técnica da Comissão Executiva do Plano da Lavoura Cacaueira (Ceplac) e financiado pelo Fundo de Desenvolvimento da Cacauicultura no Pará (Funcacau).

## 4.4 Função `generatePDA` — assinatura e lógica

```typescript
// src/lib/generate-pda.ts

export interface PDAOptions {
  visitId:  string;
  format:   'pdf' | 'docx';
}

export async function generatePDA(options: PDAOptions): Promise<Buffer> {
  // 1. Buscar dados
  const visit    = await getVisit(options.visitId);
  const producer = await getProducer(visit.producer_id);
  const property = await getProperty(visit.property_id);
  const crop     = await getCacauCrop(visit.producer_id);          // culture='cacau', status='em_andamento'
  const obs      = await getCacauObs(options.visitId);
  const recs     = await getRecommendations(options.visitId);      // ordenado por categoria
  const fins     = await getFinancialRecords(crop.id);             // ano corrente

  // 2. Calcular teto produtivo (se ainda não persistido)
  if (!crop.teto_kg) {
    const workspace = await getWorkspace(visit.workspace_id);
    const benchmark = workspace.cacau_benchmark_kg_ha ?? 847;
    const teto = calcTetoProdutivo(crop, obs, benchmark);
    await updateCropTeto(crop.id, teto); // persiste em crops
    Object.assign(crop, teto);
  }

  // 3. Gerar textos de recomendação ausentes (IA)
  await ensureRecommendationTexts(obs);  // ver seção 4.5

  // 4. Montar documento
  const docBuffer = await buildPDADocument({ visit, producer, property, crop, obs, recs, fins });

  // 5. Converter para PDF se necessário
  if (options.format === 'pdf') {
    return await convertDocxToPdf(docBuffer);
  }
  return docBuffer;
}
```

## 4.5 Geração de textos por IA

Para campos `_recomendacao` e `_como_iniciar` em branco, chamar a Claude API.

```typescript
async function ensureRecommendationTexts(obs: CacauObservacoesTecnicas): Promise<void> {
  const pares: Array<{
    campo: keyof CacauObservacoesTecnicas;
    label: string;
    cscacauRef: string;
    recCampo: keyof CacauObservacoesTecnicas;
    inicioCampo: keyof CacauObservacoesTecnicas;
  }> = [
    { campo: 'areas_limpas_arejadas',           label: 'Limpeza e Arejamento das áreas',    cscacauRef: '1.1.2', recCampo: 'areas_limpas_recomendacao',         inicioCampo: 'areas_limpas_como_iniciar' },
    { campo: 'faz_analise_solo_foliar',         label: 'Análise de Solo e/ou Foliar',       cscacauRef: '1.6.1', recCampo: 'analise_solo_recomendacao',         inicioCampo: null },
    { campo: 'faz_controle_fungico_preventivo', label: 'Controle Fúngico Preventivo',       cscacauRef: '1.8.3', recCampo: 'controle_fungico_recomendacao',      inicioCampo: null },
    { campo: 'faz_poda_fitossanitaria',         label: 'Poda Fitossanitária',               cscacauRef: '1.9.1', recCampo: 'poda_fitossanitaria_recomendacao',   inicioCampo: null },
    // ... (repetir para todos os campos com recomendação)
  ];

  for (const par of pares) {
    if (obs[par.recCampo]) continue; // já preenchido

    const valorObservado = obs[par.campo] as string;
    const textos = await gerarTextoRecomendacao({
      campo: par.label,
      valorObservado,
      cscacauRef: par.cscacauRef,
    });

    obs[par.recCampo] = textos.recomendacao as any;
    if (par.inicioCampo) obs[par.inicioCampo] = textos.comoIniciar as any;
  }

  await saveCacauObs(obs);
}

async function gerarTextoRecomendacao(params: {
  campo: string;
  valorObservado: string;
  cscacauRef: string;
}): Promise<{ recomendacao: string; comoIniciar: string }> {
  const prompt = `
Você é um agrônomo especialista em cacauicultura sustentável no estado do Pará, Brasil.
Baseado no Currículo de Sustentabilidade do Cacau (CSCacau), gere dois textos curtos:

Campo avaliado: ${params.campo}
Valor observado: ${params.valorObservado}
Referência CSCacau: ${params.cscacauRef}

Gere:
1. "Benefícios e Recomendações" (2-3 frases): benefício de adotar esta prática + ação específica recomendada.
2. "Como iniciar" (1-2 frases): instrução prática e objetiva de como começar.

Responda APENAS com JSON válido, sem markdown:
{"recomendacao": "...", "comoIniciar": "..."}

Tom: direto, encorajador, linguagem simples para produtor rural do Pará.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;
  return JSON.parse(text);
}
```

## 4.6 Rota da API

```typescript
// app/api/visits/[visitId]/generate-pda/route.ts

export async function POST(req: Request, { params }: { params: { visitId: string } }) {
  const { format } = await req.json() as { format: 'pdf' | 'docx' };

  // Auth: verificar workspace do técnico vs workspace da visita
  const session = await getServerSession();
  const visit = await getVisit(params.visitId);
  if (visit.workspace_id !== session.workspace_id) return new Response(null, { status: 403 });

  const buffer = await generatePDA({ visitId: params.visitId, format });

  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const filename = `laudo-pda-${visit.producer_name}-${visit.visited_at}.${format}`;

  // Atualizar timestamp de geração
  await updateVisit(params.visitId, { pda_generated_at: new Date() });

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

---

# PARTE 5 — MAPEAMENTO KOBO → PLATAFORMA

## 5.1 Formulário de Diagnóstico / Linha de Base

**Arquivo Kobo:** `aVvZQEfujPoTp4E63ikHeJ.xlsx`  
**Uso:** Cadastro inicial do produtor (1× por produtor, pré-projeto)

| Seção Kobo | Campo Kobo | Tabela.Campo |
|---|---|---|
| 1. Cadastro | `nome_resp` | `producers.name` |
| 1. Cadastro | `situacao_benef` | `producers.status` |
| 1. Cadastro | `genero_resp` | `producers.gender` |
| 1. Cadastro | `cpf` | `producers.cpf` |
| 1. Cadastro | `data_nasc` | `producers.birth_date` |
| 1. Cadastro | `escolaridade` | `producers.education_level` |
| 1. Cadastro | `possui_dap` | `producers.has_dap` |
| 1. Cadastro | `tipo_dap` | `producers.dap_type` |
| 1. Cadastro | `validade_dap` | `producers.dap_expiry` |
| 1. Cadastro | `celular` | `producers.phone` |
| 1. Cadastro | `cidade` | `producers.city` |
| 1. Cadastro | `gps_propriedade` | `producers.latitude` + `producers.longitude` |
| 2. Propriedade | `tamanho_area` | `properties.total_area` |
| 2. Propriedade | `medida_area` | `properties.area_unit` |
| 2. Propriedade | `inscrito_car` | `properties.has_car` |
| 2. Propriedade | `num_car` | `properties.car_number` |
| 2. Propriedade | `tipo_documento` | `properties.land_document_type` |
| 2. Propriedade | `area_anuais` | `properties.annual_crops_area_ha` |
| 3. Insumos (1–5) | `desc_insumos` | `producers.baseline_data->>'insumos_score'` (JSONB) |
| 3. Insumos (1–5) | `desc_solo` | `producers.baseline_data->>'solo_score'` |
| 3. Insumos (1–5) | `desc_pragas` | `producers.baseline_data->>'pragas_score'` |
| 3. Insumos (1–5) | `desc_biomassa` | `producers.baseline_data->>'biomassa_score'` |
| 3. Insumos (1–5) | `desc_agua` | `producers.baseline_data->>'agua_score'` |
| 3. Insumos (1–5) | `desc_sementes` | `producers.baseline_data->>'sementes_score'` |
| 3. Insumos (1–5) | `desc_energia` | `producers.baseline_data->>'energia_score'` |
| 4. Mapeamento (repeat) | `nome_produto` | `crops.culture` |
| 4. Mapeamento (repeat) | `quant_produzida` | `crops.actual_production_kg` |
| 4. Mapeamento (repeat) | `produto_cargill` | `crops.is_project_crop` (boolean) |
| 6. Gestão | `gestao_compras` | `producers.records_input_costs` |
| 6. Gestão | `gestao_vendas` | `producers.records_sales` |
| 10. Renda | `estab_renda` | `producers.income_stability_score` |
| 10. Renda | `endividamento` | `producers.debt_score` |
| 10. Renda | `cred_pronaf` | `producers.has_pronaf` |
| 11. Bens | `qnt_trator` | `producers.num_tractors` |
| 11. Bens | `acesso_internet` | `producers.has_internet` |

## 5.2 Formulário de Visita Técnica de Cacau

**Arquivo Kobo:** `agoAoV59bVqhFDyr5Wdngh__2_.xlsx`  
**Uso:** Visitas 1ª a 10ª por produtor

| Seção Kobo | Campo Kobo | Tabela.Campo |
|---|---|---|
| Cabeçalho | `consultor` | `visits.technician_id` (lookup por name em users) |
| Cabeçalho | `data_aplicacao_questionario` | `visits.visited_at` |
| Cabeçalho | `ciclo_de_visita` | `visits.cycle_number` (primeira_visita=1 … decima_visita=10) |
| Cabeçalho | `uuid_produtor` | `visits.producer_id` (via pulldata do CSV produtores.csv) |
| Cabeçalho | `geolocalizacao` | `visits.latitude` + `visits.longitude` |
| Dados benef. | `endereco_produtor_cadastro` | `properties.address` |
| Dados benef. | `TELEFONE` | `producers.phone` |
| Indicadores | `nome_da_fazenda` | `properties.name` |
| Indicadores | `sistema_producao_predominante` | `crops.sistema_producao` |
| Indicadores | `area_total_propriedade_ha` | `properties.total_area_ha` |
| Indicadores | `area_cacau_producao_ha` | `crops.area_cacau_producao_ha` |
| Indicadores | `area_app_rl_ha` | `crops.area_app_rl_ha` |
| Indicadores | `area_arrendada_meeiro` | `crops.area_arrendada_ha` |
| Indicadores | `area_em_consorcio_ha` | `crops.area_consorcio_ha` |
| Indicadores | `area_irrigada_ha` | `crops.area_irrigada_ha` |
| Indicadores | `preco_medio_estimado_rs_kg` | `crops.preco_medio_kg` |
| Indicadores | `producao_ano_anterior_kg` | `crops.producao_ano_anterior_kg` |
| Indicadores | `producao_ano_atual_kg` | `crops.producao_ano_atual_kg` |
| Indicadores | `produtividade_kg_ha` | `crops.actual_yield_kg_ha` (calculado) |
| Indicadores | `numero_talhoes` | `crops.numero_talhoes` |
| Indicadores | `numero_talhoes_arrendado` | `crops.numero_talhoes_arrendado` |
| Descrição | `material_genetico_da_fazenda` | `crops.material_genetico` |
| Descrição | `area_cacau_declarada_ha` | `crops.area_cacau_declarada_ha` |
| Descrição | `faz_analise_solo_ou_foliar` | `cacau_obs.faz_analise_solo_foliar` |
| Descrição | `faz_adubacao_solo` | `cacau_obs.faz_adubacao_solo` |
| Descrição | `faz_adubacao_foliar` | `cacau_obs.faz_adubacao_foliar` |
| Descrição | `faz_correcao_do_solo` | `cacau_obs.faz_correcao_solo` |
| Descrição | `faz_poda_manutencao` | `cacau_obs.faz_poda_manutencao` |
| Descrição | `faz_poda_fitossanitaria` | `cacau_obs.faz_poda_fitossanitaria` |
| Descrição | `faz_controle_fungico_preventiv` | `cacau_obs.faz_controle_fungico_preventivo` |
| Descrição | `faz_fermentacao_na_fazenda` | `crops.faz_fermentacao` |
| Descrição | `Qual_tipo_de_fermentacao` | `crops.tipo_fermentacao` |
| Obs. técnicas | `area_producao_limpa_arejada` | `cacau_obs.areas_limpas_arejadas` |
| Obs. técnicas | `espacamento_utilizado_cacau` | `cacau_obs.espacamento_utilizado` |
| Obs. técnicas | `areas_cacau_estao_adensadas` | `cacau_obs.areas_bem_adensadas` |
| Obs. técnicas | `copas_bem_formada_baixa_desent` | `cacau_obs.copas_bem_formadas` |
| Obs. técnicas | `plantas_saudaveis_sem_deficien` | `cacau_obs.plantas_saudaveis` |
| Obs. técnicas | `vassoura_bruxa_bem_controlada` | `cacau_obs.vassoura_bruxa_controlada` |
| Obs. técnicas | `podridao_parda_bem_controlada` | `cacau_obs.podridao_parda_controlada` |
| Agr. regen. | `utiliza_cultura_cobertura` | `cacau_obs.usa_cultura_cobertura` |
| Agr. regen. | `utiliza_plantio_direto_nova_ar` | `cacau_obs.usa_plantio_direto` |
| Agr. regen. | `utiliza_organico_fertilizante` | `cacau_obs.usa_material_organico` |
| Agr. regen. | `tem_plano_adubacao` | `cacau_obs.tem_plano_adubacao` |
| Agr. regen. | `preserva_app` | `cacau_obs.conserva_mata_ciliar` |
| Agr. regen. | `utiliza_cerca_viva` | `cacau_obs.usa_cerca_viva` |
| Agr. regen. | `adota_manejo_pragas_doencas` | `cacau_obs.adota_mip` |
| Agr. regen. | `aplica_agricultura_precisao` | `cacau_obs.usa_agricultura_precisao` |
| Agr. regen. | `participa_acoes_comunitarias` | `cacau_obs.participa_acoes_comunitarias` |
| Agr. regen. | `faz_tratamento_casqueiro` | `cacau_obs.faz_tratamento_casqueiro` |
| Recomend. (repeat) | `setor_ater` | `recommendations.category` |
| Recomend. (repeat) | `anotacao_realizado_discutido` | `recommendations.description` |
| Recomend. (repeat) | `DETALHAMENTO_DA_RECOMENDA_O` | `recommendations.recommendation_text` |
| Recomend. (repeat) | `QUANDO` | `recommendations.due_date` |
| Recomend. (repeat) | `POR_QUE` | `recommendations.rationale` |
| Recomend. (repeat) | `foto` | `recommendations.photo_url` |
| Avaliação | `ATRIBUA_UMA_NOTA_DE_10_E_SATISFA_O_TOTAL` | `visits.producer_rating_score` |
| Avaliação | `COM_QUE_FREQU_NCIA_VOC_GOSTAR` | `visits.preferred_visit_frequency` |

## 5.3 Municípios válidos

```typescript
// Valores canônicos para producers.city e properties.city
export const MUNICIPIOS_PROJETO = [
  { value: 'altamira',       label: 'Altamira/PA' },
  { value: 'anapu',          label: 'Anapu/PA' },
  { value: 'brasil_novo',    label: 'Brasil Novo/PA' },
  { value: 'medicilandia',   label: 'Medicilândia/PA' },
  { value: 'pacaja',         label: 'Pacajá/PA' },
  { value: 'placas',         label: 'Placas/PA' },
  { value: 'uruara',         label: 'Uruará/PA' },
  { value: 'vitoria_do_xingu', label: 'Vitória do Xingu/PA' },
] as const;
```

## 5.4 Regras de sincronização

| # | Regra |
|---|---|
| RS-01 | Formulário de diagnóstico **cria** `producer` e `property`. Formulário de visita **atualiza** (nunca duplica). |
| RS-02 | `uuid_produtor` do Kobo (via CSV `produtores.csv`) é a chave de ligação. Persistir em `producers.kobo_uuid`. |
| RS-03 | Se `ATUALIZAR_DADOS_DO_BENEFICI_RI = 'sim'`, campos da seção de dados do beneficiário sobrescrevem cadastro. |
| RS-04 | Crop de cacau ativo = `producer_id + culture='cacau' + status='em_andamento'`. Se não existir, criar na 1ª visita. |
| RS-05 | Cada visita gera exatamente **uma** linha em `cacau_observacoes_tecnicas` (UNIQUE visit_id). |
| RS-06 | `ciclo_de_visita` Kobo → `visits.cycle_number` (primeira_visita=1, …, decima_visita=10). |
| RS-07 | Dados financeiros do Laudo (gestão de custos mensal) → `financial_records` com `reference_date = primeiro dia do mês`. |

---

# PARTE 6 — INTEGRAÇÕES E ARQUIVOS AFETADOS

## 6.1 Dexie (IndexedDB) — todas as novas tabelas

```typescript
// dexie.ts — adicionar à versão atual + 1

db.version(VERSAO_ATUAL + 1).stores({
  // tabelas existentes mantidas
  crops:                        '++id, workspace_id, producer_id, property_id, culture, status',
  visit_crops:                  '[visit_id+crop_id], visit_id, crop_id',
  financial_records:            '++id, workspace_id, producer_id, crop_id, visit_id, type, reference_date',
  cacau_observacoes_tecnicas:   '++id, workspace_id, visit_id, crop_id',
});
```

## 6.2 sync-engine.ts — novas tabelas sincronizáveis

```typescript
export const SYNCABLE_TABLES = [
  // ... tabelas existentes ...
  'crops',
  'visit_crops',
  'financial_records',
  'cacau_observacoes_tecnicas',
] as const;
```

## 6.3 Páginas e componentes afetados

| Arquivo | Mudança |
|---|---|
| `producers/[id]/page.tsx` | + aba "Culturas e Safras" + aba "Financeiro" |
| `visits/[id]/page.tsx` | + seção "Safras abordadas" + seção "Financeiro" + seção "Cacau" (condicional) + botão "Gerar Laudo PDA" |
| `crops/[id]/page.tsx` | Novo — detalhe da safra com financeiro |
| `generate-pda.ts` | Novo — gerador do Laudo PDA |
| `export-excel.ts` | + aba "Culturas" + aba "Financeiro" + aba "Cacau" + aba "Gestão de Custos" |

## 6.4 Campo adicional em `visits`

```sql
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS cycle_number         integer,        -- 1 a 10 (ciclo de visita)
  ADD COLUMN IF NOT EXISTS producer_rating_score integer,       -- nota 0-10 do produtor
  ADD COLUMN IF NOT EXISTS preferred_visit_frequency text,      -- 'mensal','bimestral','trimestral','semestral'
  ADD COLUMN IF NOT EXISTS pda_generated_at     timestamptz;    -- última geração do Laudo PDA
```

---

# PARTE 7 — DECISÕES EM ABERTO

Registrar decisão antes de implementar:

| # | Questão | Opção recomendada | Impacto se mudar |
|---|---|---|---|
| D-01 | Textos de recomendação: IA ou lookup? | **Híbrido** — IA na primeira vez, persistido depois | Tabela de lookup fixo como fallback offline |
| D-02 | Talhões: tabela `crop_plots` ou JSON? | **JSON em `notes`** na fase 1; normalizar na fase 2 | Fase 2 requer migration e UI de talhões |
| D-03 | Laudo PDA: PDF ou Word? | **Word** — editável pelo técnico no campo | Adicionar geração de PDF como segunda opção |
| D-04 | Scores calculados: SQL ou TypeScript? | **TypeScript** (app layer) persistindo resultado em `crops` | SQL trigger exige acesso DBA; app layer mais portável |
| D-05 | Benchmark 847 kg/ha: por workspace ou município? | **Por workspace** na fase 1 | Tabela `cacau_benchmarks` por município na fase 2 |
| D-06 | Fotos no Laudo PDA? | **Sim** — primeiras 3 fotos das recomendações | Aumenta tamanho do arquivo; adicionar flag de controle |
| D-07 | Categorias financeiras: fixas ou configuráveis? | **Fixas** com subcategorias por cultura | Tabela `financial_categories` por workspace na fase 2 |
| D-08 | Lançamento financeiro fora de visita? | **Sim** — via perfil do produtor (dados históricos) | Necessário para linha de base financeira pré-projeto |
