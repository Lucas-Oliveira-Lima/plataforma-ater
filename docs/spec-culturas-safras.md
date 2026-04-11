# Especificação — Módulo de Culturas e Safras

**Status:** Rascunho  
**Versão:** 1.0  
**Contexto:** Plataforma ATER — acompanhamento técnico de produtores rurais

---

## 1. Contexto e objetivo

O acompanhamento de culturas e safras é a espinha dorsal do impacto técnico de um projeto de ATER. Sem esse registro estruturado, as visitas ficam soltas no tempo e não é possível responder às perguntas mais importantes do projeto:

- O produtor aumentou sua produtividade após X visitas de acompanhamento?
- Como evoluiu a área plantada de uma cultura ao longo das safras?
- Quais culturas mais se beneficiaram das recomendações técnicas?
- Como comparar o desempenho entre produtores dentro do mesmo projeto?

O módulo precisa registrar **o que o produtor planta, quando, em que área, o que esperava colher e o que efetivamente colheu**, vinculando esse ciclo às visitas de ATER que aconteceram durante o período.

---

## 2. Conceitos do domínio

### 2.1 Cultura
O tipo de produto agrícola cultivado (soja, milho, feijão, café, mandioca, etc.). Pode ser anual, semestral ou perene.

### 2.2 Safra
Uma instância específica de cultivo: **cultura + propriedade + período**. É o objeto central do módulo. Exemplos:
- Soja · Fazenda Santa Rita · Safra Verão 2024/2025
- Milho Safrinha · Fazenda Santa Rita · Safra Inverno 2025
- Café · Sítio do Morro · Ano agrícola 2025

Uma safra tem um ciclo de vida: **Planejada → Em andamento → Colhida** (ou Perdida).

### 2.3 Ano agrícola / tipo de safra
No Brasil, o calendário agrícola é organizado por:
- **Safra de verão (1ª safra):** plantio out–dez, colheita mar–mai
- **Safra de inverno / Safrinha (2ª safra):** plantio jan–mar, colheita jun–ago
- **Safra anual / perene:** culturas de ciclo contínuo (café, cana, fruticultura, pecuária)

### 2.4 Produtividade
Medida central de impacto. Calculada em kg/ha ou sc/ha (sacas por hectare).
- **Produtividade esperada:** meta declarada pelo produtor no início do ciclo
- **Produtividade real:** resultado declarado na colheita
- O delta entre as duas, ao longo de múltiplas safras, é o indicador de impacto da ATER

### 2.5 Vínculo com a visita
Cada visita de acompanhamento ocorre durante um ciclo de uma ou mais safras ativas. O técnico deve indicar **quais safras esta visita abordou**, e os registros agronômicos (diagnósticos, recomendações) passam a ser contextualizados por safra — não apenas por data.

---

## 3. Modelo de dados

### 3.1 Tabela `crops` (safras)

```sql
CREATE TABLE public.crops (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  producer_id          uuid        NOT NULL REFERENCES producers(id) ON DELETE CASCADE,
  property_id          uuid        REFERENCES properties(id) ON DELETE SET NULL,

  -- Identificação da cultura
  culture              text        NOT NULL,           -- 'soja', 'milho', 'cafe', 'feijao'...
  culture_variety      text,                           -- Variedade/híbrido utilizado

  -- Período / safra
  season_year          integer     NOT NULL,           -- Ano de referência: 2025
  season_type          text        NOT NULL            -- 'verao', 'inverno', 'anual', 'perene'
                       CHECK (season_type IN ('verao', 'inverno', 'anual', 'perene')),

  -- Área e plantio
  planted_area_ha      numeric,                        -- Área plantada em hectares
  planted_at           date,                           -- Data de plantio
  expected_harvest_at  date,                           -- Previsão de colheita

  -- Resultado (preenchido na colheita)
  harvested_at         date,                           -- Data real de colheita
  expected_yield_kg_ha numeric,                        -- Produtividade esperada (kg/ha)
  actual_yield_kg_ha   numeric,                        -- Produtividade real (kg/ha)
  expected_production_kg numeric,                      -- Produção total esperada
  actual_production_kg   numeric,                      -- Produção total real
  sale_price_per_kg    numeric,                        -- Preço de venda declarado (R$/kg)

  -- Status do ciclo
  status               text        NOT NULL DEFAULT 'planejada'
                       CHECK (status IN ('planejada', 'em_andamento', 'colhida', 'perdida')),
  loss_reason          text,                           -- Motivo de perda (seca, praga, etc.)

  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crops_workspace" ON public.crops
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

-- Índices
CREATE INDEX idx_crops_producer  ON public.crops(producer_id);
CREATE INDEX idx_crops_property  ON public.crops(property_id);
CREATE INDEX idx_crops_workspace ON public.crops(workspace_id, season_year, status);
```

### 3.2 Tabela `visit_crops` (visita ↔ safra, N:N)

Uma visita pode abordar múltiplas safras, e uma safra pode ter múltiplas visitas.

```sql
CREATE TABLE public.visit_crops (
  visit_id  uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  crop_id   uuid NOT NULL REFERENCES crops(id)  ON DELETE CASCADE,
  PRIMARY KEY (visit_id, crop_id)
);

ALTER TABLE public.visit_crops ENABLE ROW LEVEL SECURITY;

-- Acesso via workspace da visita
CREATE POLICY "visit_crops_workspace" ON public.visit_crops
  FOR ALL USING (
    visit_id IN (
      SELECT id FROM visits WHERE workspace_id = public.get_user_workspace_id()
    )
  );
```

### 3.3 Campo adicional em `visit_records` e `recommendations`

Recomendações e registros agronômicos passam a poder referenciar uma safra específica:

```sql
ALTER TABLE public.visit_records   ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES crops(id);
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES crops(id);
```

---

## 4. Enumeração de culturas sugeridas

Lista base para o select do campo `culture`. Pode ser expandida por workspace no futuro.

**Grãos e cereais:** soja, milho, feijão, arroz, trigo, sorgo, girassol  
**Olericultura:** tomate, alface, cebola, mandioca, batata-doce, abóbora  
**Fruticultura:** banana, laranja, mamão, abacate, manga, uva, maracujá  
**Culturas permanentes:** café, cana-de-açúcar, eucalipto, seringa  
**Pecuária integrada:** pastagem, silagem  
**Outro:** campo livre

---

## 5. Regras de negócio

| # | Regra |
|---|---|
| RN-01 | Uma safra deve ter ao menos `culture`, `season_year`, `season_type` e `producer_id` |
| RN-02 | `planted_area_ha` não pode exceder a área total da propriedade (validação leve, aviso) |
| RN-03 | Transições de status válidas: `planejada → em_andamento → colhida / perdida`. Não retrocede. |
| RN-04 | `actual_yield_kg_ha` e `actual_production_kg` só podem ser preenchidos quando `status = 'colhida'` |
| RN-05 | Uma safra `em_andamento` com `expected_harvest_at` vencida deve gerar alerta visual |
| RN-06 | O campo `loss_reason` é obrigatório quando `status = 'perdida'` |
| RN-07 | Duas safras da mesma `culture + property_id + season_year + season_type` geram aviso de duplicidade |

---

## 6. Fluxos do usuário

### 6.1 Cadastro de safra (novo ciclo)
```
Detalhe do produtor
  → Aba "Culturas / Safras"
    → Botão "+ Nova safra"
      → Formulário:
          Cultura (select)
          Variedade/híbrido (texto)
          Propriedade (select — se o produtor tiver mais de uma)
          Ano agrícola + Tipo de safra (Verão / Inverno / Anual / Perene)
          Área plantada (ha)
          Data de plantio
          Previsão de colheita
          Produtividade esperada (kg/ha)
          Status inicial (Planejada / Em andamento)
          Observações
      → Salva e aparece no histórico
```

### 6.2 Encerramento / Colheita
```
Lista de safras do produtor
  → Safra com status "Em andamento"
    → Botão "Registrar colheita"
      → Campos adicionais:
          Data real de colheita
          Produtividade real (kg/ha)
          Produção total (kg) [auto-calculado ou manual]
          Preço de venda (R$/kg)
          Observações
      → Status muda para "Colhida"
      → Calcula automaticamente a variação vs esperado
```

### 6.3 Vínculo com visita
```
Tela da visita (ativa)
  → Seção "Safras abordadas nesta visita"
    → Lista de safras ativas do produtor (status: em_andamento)
    → Técnico marca quais foram abordadas
    → Opcional: qual safra o registro agronômico ou recomendação se refere
```

### 6.4 Histórico / evolução
```
Detalhe do produtor → Aba "Culturas / Safras"
  → Lista cronológica por safra
  → Para cada safra: indicador visual de produtividade (esperada vs real)
  → Filtros: cultura, ano, status
  → Gráfico de evolução de produtividade ao longo das safras (fase futura)
```

---

## 7. Integração com o sistema existente

| Entidade existente | Mudança necessária |
|---|---|
| `producers/[id]/page.tsx` | Adicionar aba/seção "Culturas e Safras" |
| `visits/[id]/page.tsx` | Adicionar seção "Safras abordadas" + filtro de safra em records/recomendações |
| `visit_records` | Campo `crop_id` opcional |
| `recommendations` | Campo `crop_id` opcional |
| `dexie.ts` | Nova tabela `crops` e `visit_crops` no IndexedDB |
| `sync-engine.ts` | Adicionar `crops` e `visit_crops` à `SYNCABLE_TABLES` |
| `export-excel.ts` | Nova aba "Culturas" no export |

---

## 8. Indicadores gerados pelo módulo

Uma vez implementado, o módulo permite calcular:

- **Produtividade média por cultura** por produtor e por safra
- **Taxa de atingimento de meta** (actual / expected) por safra
- **Evolução temporal** — produtividade safra 1 vs safra 4 vs safra 8
- **Área total cultivada** por produtor por ano
- **Diversificação de culturas** por workspace/projeto
- **Safras com perda** — incidência e principais causas

---

## 9. Decisões em aberto

| # | Questão | Opções | Impacto |
|---|---|---|---|
| D-01 | A lista de culturas é fixa (enum) ou cada workspace pode customizar? | Enum global / Lista por workspace | Se customizável, precisa de tabela `culture_types` por workspace |
| D-02 | A unidade de produtividade é sempre kg/ha? | kg/ha fixo / configurável por cultura (sc/ha, cx/ha) | Afeta cálculos e exibição |
| D-03 | Safra é vinculada à propriedade ou ao produtor diretamente? | Propriedade (mais específico) / Produtor (mais simples) | Produtores sem propriedade cadastrada perdem vínculo geográfico |
| D-04 | Uma visita pode cobrir safras de propriedades diferentes? | Sim (mais flexível) / Não (1 visita = 1 propriedade) | Afeta `visit_crops` — se não, a propriedade vira campo da visita |
| D-05 | A "linha de base de primeira visita" é uma safra ou um formulário separado? | Safra (dados de produção pré-ATER) / Formulário de diagnóstico / Ambos | Define se a linha de base vira um `crop` com status especial ou segue como form |
