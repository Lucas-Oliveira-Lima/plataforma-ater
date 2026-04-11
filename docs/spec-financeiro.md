# Especificação — Módulo Financeiro

**Status:** Rascunho  
**Versão:** 1.0  
**Contexto:** Plataforma ATER — registros financeiros declarados pelo produtor durante visitas

---

## 1. Contexto e objetivo

Os dados financeiros são os indicadores mais diretos de impacto econômico de um projeto de ATER. Perguntas como "o produtor aumentou sua renda?" ou "o custo de produção por kg diminuiu após as recomendações técnicas?" só podem ser respondidas com registros financeiros estruturados.

### O que este módulo **não é**
- Não é um sistema de contabilidade — os dados são **autodeclarados pelo produtor** durante a visita
- Não substitui notas fiscais ou comprovantes — é um instrumento de acompanhamento técnico
- Não calcula impostos nem obrigações legais

### O que este módulo **é**
- Um registro de receitas e despesas agrícolas por safra/período
- Um instrumento para medir a evolução econômica do produtor ao longo do projeto
- Uma fonte de dados para relatórios de impacto do projeto (ATER, financiador, governo)
- Uma forma de comparar o desempenho econômico antes e depois das intervenções técnicas

---

## 2. Conceitos do domínio

### 2.1 Registro financeiro
Uma entrada de receita ou despesa agrícola, declarada pelo produtor em uma visita. Cada registro tem:
- Tipo: **receita** ou **despesa**
- Categoria (veja seção 4)
- Valor em R$
- Período de competência (não necessariamente o dia da visita)
- Vínculo opcional com uma safra específica

### 2.2 Período de competência
A data ou período a que o fato financeiro **se refere**, não quando foi registrado. Ex.: o produtor menciona na visita de março/2025 que vendeu a soja por R$ 120/sc em fevereiro/2025. O registro deve ser datado de fevereiro, não de março.

### 2.3 Margem de contribuição por safra
Cálculo derivado:  
`Receitas da safra − Custos variáveis da safra = Margem de contribuição`

Este é um dos indicadores mais úteis para o técnico apresentar ao produtor como feedback do acompanhamento.

### 2.4 Custo de produção (R$/kg ou R$/sc)
Cálculo derivado a partir do módulo de culturas:  
`Total de despesas da safra ÷ Produção real (kg) = Custo de produção unitário`

Permite comparar o produtor com médias regionais e acompanhar a evolução entre safras.

---

## 3. Modelo de dados

### 3.1 Tabela `financial_records`

```sql
CREATE TABLE public.financial_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  producer_id      uuid        NOT NULL REFERENCES producers(id)  ON DELETE CASCADE,
  property_id      uuid        REFERENCES properties(id) ON DELETE SET NULL,

  -- Vínculo com visita e safra (ambos opcionais mas recomendados)
  visit_id         uuid        REFERENCES visits(id) ON DELETE SET NULL,
  crop_id          uuid        REFERENCES crops(id)  ON DELETE SET NULL,

  -- Dados do registro
  type             text        NOT NULL CHECK (type IN ('receita', 'despesa')),
  category         text        NOT NULL,    -- Ver enumeração na seção 4
  description      text,                    -- Detalhe livre (ex: "Herbicida Roundup 20L")
  amount           numeric(12,2) NOT NULL,  -- Valor em R$
  quantity         numeric,                 -- Quantidade (opcional: 20 litros, 50 sacas)
  unit             text,                    -- Unidade: 'L', 'kg', 'sc', 'h', 'diária'

  -- Período de competência
  reference_date   date        NOT NULL,    -- Quando ocorreu o fato financeiro
  reference_period text,                    -- Label legível: "Safra Verão 2024/2025"

  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_records_workspace" ON public.financial_records
  FOR ALL USING (workspace_id = public.get_user_workspace_id());

-- Índices
CREATE INDEX idx_financial_producer  ON public.financial_records(producer_id, reference_date);
CREATE INDEX idx_financial_visit     ON public.financial_records(visit_id);
CREATE INDEX idx_financial_crop      ON public.financial_records(crop_id);
CREATE INDEX idx_financial_type      ON public.financial_records(workspace_id, type, reference_date);
```

---

## 4. Categorias de receitas e despesas

### 4.1 Despesas (`type = 'despesa'`)

| Código | Label | Exemplos |
|---|---|---|
| `sementes` | Sementes e mudas | Semente de soja certificada, muda de café |
| `fertilizantes` | Fertilizantes e corretivos | NPK, ureia, calcário, gesso agrícola |
| `defensivos` | Agroquímicos / Defensivos | Herbicida, fungicida, inseticida, adjuvante |
| `mao_obra` | Mão de obra | Diária, empreitada, encargos |
| `mecanizacao` | Mecanização | Aluguel de trator, colheitadeira, plantadeira |
| `arrendamento` | Arrendamento de terra | Aluguel de área, parceria |
| `energia` | Energia e combustível | Diesel, energia elétrica para irrigação |
| `irrigacao` | Irrigação | Manutenção de sistema, energia, mão de obra |
| `transporte` | Transporte e fretes | Frete de insumos, transporte da produção |
| `assistencia_tecnica` | Assistência técnica | Laudos, análises de solo, consultoria |
| `outros_custos` | Outros custos | Embalagens, armazenagem, taxas |

### 4.2 Receitas (`type = 'receita'`)

| Código | Label | Exemplos |
|---|---|---|
| `venda_producao` | Venda da produção principal | Soja 2000sc × R$120 |
| `venda_subproduto` | Venda de subprodutos | Palha, silagem, subprodutos agroindustriais |
| `venda_animal` | Venda de animais | Boi gordo, frango, suíno |
| `paa_pnae` | Compras institucionais | PAA, PNAE, alimentação escolar |
| `seguro_sinistro` | Seguro agrícola | Indenização por sinistro, Proagro |
| `subsidio` | Subsídio / apoio governamental | Pronaf, crédito subsidiado recebido |
| `servicos` | Prestação de serviços | Arrendamento cedido, serviços com máquinas |
| `outros_receitas` | Outras receitas | |

---

## 5. Regras de negócio

| # | Regra |
|---|---|
| RN-01 | `amount` deve ser positivo — o tipo (receita/despesa) já indica o sinal |
| RN-02 | `reference_date` não pode ser no futuro |
| RN-03 | Se `crop_id` informado, `producer_id` e `property_id` do crop devem coincidir com o do registro |
| RN-04 | Registros vinculados a uma visita não são automaticamente excluídos se a visita for excluída (`ON DELETE SET NULL`) |
| RN-05 | `quantity` e `unit` são opcionais mas fortemente recomendados para despesas de insumos (permite calcular custo unitário) |
| RN-06 | Ao encerrar uma safra (`crops.status = 'colhida'`), o sistema deve exibir um resumo financeiro da safra |
| RN-07 | Os dados são autodeclarados — a UI deve deixar isso explícito para o técnico e para relatórios |

---

## 6. Fluxos do usuário

### 6.1 Registro durante a visita (fluxo principal)
```
Tela da visita (ativa)
  → Seção "Financeiro"
    → Botão "+ Adicionar receita" ou "+ Adicionar despesa"
      → Formulário rápido:
          Tipo (Receita / Despesa)
          Categoria (select com ícones)
          Descrição livre (opcional)
          Valor (R$)
          Quantidade + Unidade (opcional)
          Data de competência (padrão: hoje)
          Período / Safra (opcional — select das safras ativas do produtor)
      → Salva inline, aparece na lista da seção
```

### 6.2 Visualização no perfil do produtor
```
Detalhe do produtor → Aba "Financeiro"
  → Filtros: período (ano/safra) + tipo
  → Resumo:
      Total receitas: R$ XXX.XXX
      Total despesas: R$ XXX.XXX
      Saldo: R$ XXX.XXX
  → Lista de registros agrupados por safra/período
  → Por safra (se vinculado a crop):
      Custo de produção: R$/kg ou R$/sc
      Margem de contribuição: R$ e %
```

### 6.3 Detalhamento por safra
```
Detalhe da safra (crops/[id])
  → Aba ou seção "Financeiro da safra"
    → Despesas por categoria (gráfico pizza ou lista)
    → Receitas
    → Margem calculada
    → Custo de produção unitário
    → Comparativo com safra anterior (se houver)
```

### 6.4 Painel do administrador (admin)
```
Admin → Indicadores financeiros
  → Receita média por produtor
  → Custo médio de produção por cultura
  → Evolução ano a ano (safra 1 vs safra 2 vs safra 3)
  → Distribuição de despesas por categoria (workspace)
```

---

## 7. Integração com o sistema existente

| Entidade existente | Mudança necessária |
|---|---|
| `visits/[id]/page.tsx` | Nova seção "Financeiro" com lista e form inline |
| `producers/[id]/page.tsx` | Nova aba/seção "Financeiro" com histórico |
| `crops` (módulo de safras) | Campo `crop_id` em `financial_records` vincula os dois módulos |
| `dexie.ts` | Nova tabela `financial_records` no IndexedDB |
| `sync-engine.ts` | Adicionar `financial_records` à `SYNCABLE_TABLES` |
| `export-excel.ts` | Nova aba "Financeiro" no export |
| `generate-pdf.ts` | Opcional: incluir resumo financeiro no PDF da visita |

---

## 8. Indicadores gerados pelo módulo

| Indicador | Fórmula | Unidade |
|---|---|---|
| Receita bruta por safra | Σ receitas vinculadas ao crop | R$ |
| Custo total por safra | Σ despesas vinculadas ao crop | R$ |
| Margem de contribuição | Receita bruta − Custo variável total | R$ |
| Custo de produção unitário | Custo total ÷ Produção real (kg) | R$/kg |
| Ponto de equilíbrio | Custo total ÷ Preço de venda (R$/kg) | kg ou sc |
| Evolução da margem | (Margem safra N − Margem safra 1) ÷ Margem safra 1 | % |
| Receita por ha | Receita bruta ÷ Área plantada | R$/ha |

---

## 9. Decisões em aberto

| # | Questão | Opções | Impacto |
|---|---|---|---|
| D-01 | As categorias são fixas ou configuráveis por workspace? | Fixas (mais simples) / Configuráveis (mais flexível) | Configurável exige tabela `financial_categories` por workspace |
| D-02 | O formulário inline na visita é rápido (3 campos) ou completo? | Rápido com opção de expandir / Sempre completo | UX no campo: rápido é melhor; mas pode perder detalhes |
| D-03 | Como lidar com registros fora de uma visita? | Só via visita (mais restrito) / Lançamento avulso no perfil do produtor | Lançamento avulso é necessário para dados históricos (pré-projeto) |
| D-04 | Moeda alternativa? | R$ fixo / Campo moeda configurável | Para projetos internacionais ou ajuste inflacionário futuro |
| D-05 | Registros pré-projeto (linha de base financeira)? | Visita especial "linha de base" / Flag `is_baseline` no registro | Importante para calcular variação de renda antes vs depois da ATER |
| D-06 | O valor total da safra no módulo de culturas (`sale_price_per_kg × actual_production_kg`) deve alimentar automaticamente um registro de receita? | Auto-criado ao encerrar safra / Manual | Evita duplicidade se o técnico registrar a venda separadamente |
