import type { CacauObservacoesTecnicas, Crop } from '@/types'

function scoreSimNao(v: string | null): number {
  if (v === 'sim') return 10
  if (v === 'parcialmente') return 5
  return 0
}

function scoreFrequencia(v: string | null): number {
  if (!v) return 0
  if (v.includes('anualmente')) return 10
  if (v.includes('bianualmente')) return 7
  if (v.includes('esporadicamente')) return 4
  if (v === 'sim') return 10
  if (v === 'parcialmente' || v.includes('em_parte')) return 5
  return 0
}

export function calcNotaAnaliseTecnica(obs: Pick<
  CacauObservacoesTecnicas,
  'areas_limpas_arejadas' | 'areas_bem_adensadas' | 'copas_bem_formadas' |
  'plantas_saudaveis' | 'vassoura_bruxa_controlada' | 'podridao_parda_controlada'
>): number {
  const campos = [
    obs.areas_limpas_arejadas,
    obs.areas_bem_adensadas,
    obs.copas_bem_formadas,
    obs.plantas_saudaveis,
    obs.vassoura_bruxa_controlada,
    obs.podridao_parda_controlada,
  ]
  const preenchidos = campos.filter((c) => c !== null && c !== undefined)
  if (preenchidos.length === 0) return 0
  return preenchidos.reduce((sum, c) => sum + scoreSimNao(c), 0) / preenchidos.length
}

export function calcNotaBoasPraticas(obs: Pick<
  CacauObservacoesTecnicas,
  'faz_analise_solo_foliar' | 'faz_correcao_solo' | 'faz_adubacao_solo' |
  'faz_adubacao_foliar' | 'faz_controle_fungico_preventivo' |
  'faz_poda_manutencao' | 'faz_poda_fitossanitaria'
>): number {
  // [score, peso]
  const praticas: [number, number][] = [
    [scoreFrequencia(obs.faz_analise_solo_foliar),         2],
    [scoreFrequencia(obs.faz_correcao_solo),               1],
    [scoreFrequencia(obs.faz_adubacao_solo),               2],
    [scoreFrequencia(obs.faz_adubacao_foliar),             1],
    [scoreFrequencia(obs.faz_controle_fungico_preventivo), 2],
    [scoreFrequencia(obs.faz_poda_manutencao),             1],
    [scoreFrequencia(obs.faz_poda_fitossanitaria),         1],
  ]
  const totalPeso  = praticas.reduce((s, [, p]) => s + p, 0)
  const totalScore = praticas.reduce((s, [sc, p]) => s + sc * p, 0)
  return totalScore / totalPeso
}

export function calcTetoProdutivo(
  crop: Pick<Crop, 'area_cacau_producao_ha' | 'planted_area_ha'>,
  obs: Parameters<typeof calcNotaAnaliseTecnica>[0] & Parameters<typeof calcNotaBoasPraticas>[0],
  benchmarkKgHa = 847
) {
  const nota_analise_tecnica = calcNotaAnaliseTecnica(obs)
  const nota_boas_praticas   = calcNotaBoasPraticas(obs)
  const coeficiente_fazenda  = (nota_analise_tecnica + nota_boas_praticas) / 2 / 10
  const area                 = crop.area_cacau_producao_ha ?? crop.planted_area_ha ?? 0
  const teto_kg              = coeficiente_fazenda * area * benchmarkKgHa
  const teto_kg_ha           = area > 0 ? teto_kg / area : 0
  return { nota_analise_tecnica, nota_boas_praticas, coeficiente_fazenda, teto_kg, teto_kg_ha }
}

// ── Constantes de categorias ──────────────────────────────────

export const DESPESA_CATEGORIES = [
  { value: 'sementes',            label: 'Sementes e mudas' },
  { value: 'fertilizantes',       label: 'Fertilizantes e corretivos' },
  { value: 'defensivos',          label: 'Agroquímicos / Defensivos' },
  { value: 'mao_obra',            label: 'Mão de obra' },
  { value: 'mecanizacao',         label: 'Mecanização' },
  { value: 'arrendamento',        label: 'Arrendamento de terra' },
  { value: 'energia',             label: 'Energia e combustível' },
  { value: 'irrigacao',           label: 'Irrigação' },
  { value: 'transporte',          label: 'Transporte e fretes' },
  { value: 'assistencia_tecnica', label: 'Assistência técnica' },
  { value: 'outros_custos',       label: 'Outros custos' },
] as const

export const RECEITA_CATEGORIES = [
  { value: 'venda_producao',    label: 'Venda da produção principal' },
  { value: 'venda_subproduto',  label: 'Venda de subprodutos' },
  { value: 'venda_animal',      label: 'Venda de animais' },
  { value: 'paa_pnae',          label: 'Compras institucionais (PAA/PNAE)' },
  { value: 'seguro_sinistro',   label: 'Seguro agrícola' },
  { value: 'subsidio',          label: 'Subsídio / apoio governamental' },
  { value: 'servicos',          label: 'Prestação de serviços' },
  { value: 'outros_receitas',   label: 'Outras receitas' },
] as const

// Subcategorias específicas de cacau (despesas)
export const CACAU_SUBCATEGORIES_INSUMOS = [
  { value: 'mudas_hastes', label: 'Mudas e/ou hastes', category: 'sementes' },
  { value: 'calcario',     label: 'Calcário',           category: 'fertilizantes' },
  { value: 'adubos',       label: 'Adubos',             category: 'fertilizantes' },
  { value: 'herbicidas',   label: 'Herbicidas',         category: 'defensivos' },
  { value: 'inseticidas',  label: 'Inseticidas',        category: 'defensivos' },
  { value: 'fungicidas',   label: 'Fungicidas',         category: 'defensivos' },
  { value: 'energia_eletrica', label: 'Energia elétrica', category: 'energia' },
  { value: 'combustivel',  label: 'Combustível',        category: 'energia' },
  { value: 'irrigacao_insumo', label: 'Irrigação (insumo)', category: 'irrigacao' },
] as const

export const CACAU_SUBCATEGORIES_SERVICOS = [
  { value: 'aracao',                       label: 'Aração' },
  { value: 'gradagem',                     label: 'Gradagem' },
  { value: 'sulcamento',                   label: 'Sulcamento' },
  { value: 'marcacao_covas',               label: 'Marcação de covas' },
  { value: 'abertura_covas',               label: 'Abertura de covas' },
  { value: 'enchimento_adubacao_covas',    label: 'Enchimento/adubação de covas' },
  { value: 'plantio_mudas',               label: 'Plantio de mudas' },
  { value: 'replantio',                    label: 'Replantio' },
  { value: 'coroamento',                   label: 'Coroamento' },
  { value: 'rocagem_trator',               label: 'Roçagem (trator)' },
  { value: 'combate_pragas',               label: 'Combate de pragas' },
  { value: 'poda_formacao',               label: 'Poda de formação' },
  { value: 'poda_manutencao_serv',         label: 'Poda de manutenção' },
  { value: 'poda_fitossanitaria_serv',     label: 'Poda fitossanitária' },
  { value: 'desbrota',                     label: 'Desbrota' },
  { value: 'aplicacao_defensivos_mip',     label: 'Aplicação de defensivos (MIP)' },
  { value: 'irrigacao_servico',            label: 'Irrigação (serviço)' },
  { value: 'fertirrigacao',               label: 'Fertiirrigação' },
  { value: 'colheita',                     label: 'Colheita' },
  { value: 'embandeiramento',              label: 'Embandeiramento' },
  { value: 'abertura_frutos',              label: 'Abertura de frutos' },
  { value: 'fermentacao_serv',             label: 'Fermentação' },
  { value: 'secagem',                      label: 'Secagem' },
  { value: 'armazenagem',                  label: 'Armazenagem' },
  { value: 'transporte_producao',          label: 'Transporte da produção' },
] as const

export const CACAU_RECOMMENDATION_CATEGORIES = [
  { value: 'recuperacao_solo',          label: 'Recuperação do Solo' },
  { value: 'fitossanidade',             label: 'Fitossanidade' },
  { value: 'adubacao',                  label: 'Adubação' },
  { value: 'producao_produtividade',    label: 'Produção e Produtividade' },
  { value: 'verticalizacao_producao',   label: 'Verticalização da Produção' },
  { value: 'diversificacao_safs',       label: 'Diversificação da Produção e SAFs' },
  { value: 'gestao_propriedade',        label: 'Gestão da Propriedade Rural' },
  { value: 'sustentabilidade_cacau',    label: 'Sustentabilidade do Cacau' },
  { value: 'direitos_humanos',          label: 'Direitos Humanos' },
] as const

export const CULTURE_OPTIONS = [
  { value: 'cacau',      label: 'Cacau' },
  { value: 'soja',       label: 'Soja' },
  { value: 'milho',      label: 'Milho' },
  { value: 'cafe',       label: 'Café' },
  { value: 'feijao',     label: 'Feijão' },
  { value: 'arroz',      label: 'Arroz' },
  { value: 'banana',     label: 'Banana' },
  { value: 'mandioca',   label: 'Mandioca' },
  { value: 'outras',     label: 'Outras' },
] as const

export const CROP_STATUS_LABELS: Record<string, string> = {
  planejada:    'Planejada',
  em_andamento: 'Em andamento',
  colhida:      'Colhida',
  perdida:      'Perdida',
}

export const CROP_STATUS_COLORS: Record<string, 'green' | 'yellow' | 'gray' | 'red'> = {
  planejada:    'yellow',
  em_andamento: 'green',
  colhida:      'gray',
  perdida:      'red',
}
