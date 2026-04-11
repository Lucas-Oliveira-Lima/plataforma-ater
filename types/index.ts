export type UserRole = 'technician' | 'admin'
export type CropStatus = 'planejada' | 'em_andamento' | 'colhida' | 'perdida'
export type SeasonType = 'verao' | 'inverno' | 'anual' | 'perene'
export type FinancialType = 'receita' | 'despesa'
export type VisitStatus = 'active' | 'completed' | 'scheduled'
export type RecordType = 'pest' | 'disease' | 'soil' | 'management'
export type Severity = 'low' | 'medium' | 'high'
export type FieldType =
  // Texto
  | 'text' | 'integer' | 'decimal' | 'note'
  // Escolha
  | 'select' | 'select_multiple' | 'checkbox'
  // Data/Hora
  | 'date' | 'time' | 'datetime'
  // Localização
  | 'gps'
  // Mídia
  | 'photo' | 'audio' | 'video'
  // Avançado
  | 'number' | 'range' | 'calculate' | 'hidden'
  // Grupos
  | 'begin_group' | 'end_group'
export type SyncOperation = 'insert' | 'update' | 'delete'
export type RecommendationCategory = 'fertilizacao' | 'defensivo' | 'irrigacao' | 'manejo' | 'outro'

export interface Workspace {
  id: string
  name: string
  cacau_benchmark_kg_ha?: number
  created_at: string
}

export interface Profile {
  id: string
  workspace_id: string
  full_name: string
  role: UserRole
  created_at: string
}

export type ProducerSex = 'M' | 'F' | 'O' | 'N'
export type ProducerStatus = 'active' | 'inactive'

export interface Producer {
  id: string
  workspace_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  cpf_cnpj: string | null
  sex: ProducerSex | null
  state: string | null
  city: string | null
  locality: string | null
  status: ProducerStatus
  created_at: string
  updated_at: string
}

export interface Property {
  id: string
  workspace_id: string
  producer_id: string
  name: string
  state: string | null
  municipality: string
  address: string | null
  car_code: string | null
  area_ha: number | null
  gps_lat: number | null
  gps_lng: number | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  workspace_id: string
  technician_id: string
  producer_id: string
  property_id: string | null
  status: VisitStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  gps_lat: number | null
  gps_lng: number | null
  audio_urls: string[]
  photo_urls: string[]
  scheduled_at: string | null
  signature_url: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistTemplate {
  id: string
  workspace_id: string
  label: string
  order_index: number
  created_at: string
}

export interface ChecklistItem {
  id: string
  workspace_id: string
  visit_id: string
  label: string
  checked: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export interface Recommendation {
  id: string
  visit_id: string
  workspace_id: string
  description: string
  category: RecommendationCategory
  created_at: string
  updated_at: string
}

export interface VisitRecord {
  id: string
  visit_id: string
  workspace_id: string
  type: RecordType
  description: string
  severity: Severity
  media_urls: string[]
  created_at: string
  updated_at: string
}

export interface Form {
  id: string
  workspace_id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FormField {
  id: string
  form_id: string
  field_name: string | null    // XLSForm name — usado em skip logic: ${field_name}
  label: string
  hint: string | null          // Texto de ajuda abaixo da pergunta
  type: FieldType
  options: string[] | null     // Opções para select / select_multiple
  required: boolean
  required_msg: string | null  // Mensagem customizada de campo obrigatório
  relevant: string | null      // Skip logic: e.g. ${q1}='sim'
  constraint_expr: string | null  // Validação: e.g. . >= 0 and . <= 100
  constraint_msg: string | null
  default_value: string | null
  appearance: string | null    // Hints de layout (minimal, compact, etc.)
  parameters: string | null    // Range: "start=0 end=10 step=1"
  read_only: boolean
  calculation: string | null   // Para campos calculate
  order_index: number
  created_at: string
}

export interface FormResponse {
  id: string
  form_id: string
  visit_id: string | null
  producer_id: string | null
  workspace_id: string
  submitted_at: string | null
  created_at: string
}

export interface FormAnswer {
  id: string
  response_id: string
  field_id: string
  value_text: string | null
  value_number: number | null
  value_date: string | null
  value_bool: boolean | null
  value_json: unknown | null
  media_url: string | null
  created_at: string
}

export interface Crop {
  id: string
  workspace_id: string
  producer_id: string
  property_id: string | null
  culture: string
  culture_variety: string | null
  season_year: number
  season_type: SeasonType
  planted_area_ha: number | null
  planted_at: string | null
  expected_harvest_at: string | null
  harvested_at: string | null
  expected_yield_kg_ha: number | null
  actual_yield_kg_ha: number | null
  expected_production_kg: number | null
  actual_production_kg: number | null
  sale_price_per_kg: number | null
  status: CropStatus
  loss_reason: string | null
  // Campos cacau
  area_cacau_producao_ha: number | null
  area_cacau_declarada_ha: number | null
  area_app_rl_ha: number | null
  area_arrendada_ha: number | null
  area_consorcio_ha: number | null
  area_irrigada_ha: number | null
  numero_talhoes: number | null
  numero_talhoes_arrendado: number | null
  producao_ano_anterior_kg: number | null
  producao_ano_atual_kg: number | null
  preco_medio_kg: number | null
  sistema_producao: string | null
  faz_fermentacao: string | null
  tipo_fermentacao: string | null
  material_genetico: string | null
  // Teto produtivo
  nota_analise_tecnica: number | null
  nota_boas_praticas: number | null
  coeficiente_fazenda: number | null
  teto_kg: number | null
  teto_kg_ha: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VisitCrop {
  visit_id: string
  crop_id: string
}

export interface FinancialRecord {
  id: string
  workspace_id: string
  producer_id: string
  property_id: string | null
  visit_id: string | null
  crop_id: string | null
  type: FinancialType
  category: string
  subcategory: string | null
  description: string | null
  amount: number
  quantity: number | null
  unit: string | null
  reference_date: string
  reference_period: string | null
  is_baseline: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CacauObservacoesTecnicas {
  id: string
  workspace_id: string
  visit_id: string
  crop_id: string
  // Seção 3 — Análise Técnica
  areas_limpas_arejadas: string | null
  areas_bem_adensadas: string | null
  copas_bem_formadas: string | null
  plantas_saudaveis: string | null
  vassoura_bruxa_controlada: string | null
  podridao_parda_controlada: string | null
  // Seção 4 — Boas Práticas
  idade_media_lavoura: string | null
  espacamento_utilizado: string | null
  faz_analise_solo_foliar: string | null
  faz_correcao_solo: string | null
  faz_adubacao_solo: string | null
  faz_adubacao_foliar: string | null
  faz_controle_fungico_preventivo: string | null
  faz_poda_manutencao: string | null
  faz_poda_fitossanitaria: string | null
  // Seção 5 — Agricultura Regenerativa
  usa_cultura_cobertura: string | null
  usa_plantio_direto: string | null
  usa_material_organico: string | null
  tem_plano_adubacao: string | null
  conserva_mata_ciliar: string | null
  usa_cerca_viva: string | null
  adota_mip: string | null
  usa_agricultura_precisao: string | null
  participa_acoes_comunitarias: string | null
  faz_tratamento_casqueiro: string | null
  // Complementares
  tem_irrigacao: string | null
  irrigacao_eficiente: string | null
  faz_controle_biologico: string | null
  usa_composto_organico: string | null
  faz_renovacao_plantel: string | null
  faz_coroamento: string | null
  controle_pragas_doencas: string | null
  tem_viveiro: string | null
  organizacao_tecnologia: string[] | null
  // Textos de recomendação
  areas_limpas_recomendacao: string | null
  areas_limpas_como_iniciar: string | null
  areas_adensadas_recomendacao: string | null
  areas_adensadas_como_iniciar: string | null
  copas_formadas_recomendacao: string | null
  copas_formadas_como_iniciar: string | null
  plantas_saudaveis_recomendacao: string | null
  plantas_saudaveis_como_iniciar: string | null
  vassoura_bruxa_recomendacao: string | null
  vassoura_bruxa_como_iniciar: string | null
  podridao_parda_recomendacao: string | null
  podridao_parda_como_iniciar: string | null
  analise_solo_recomendacao: string | null
  correcao_solo_recomendacao: string | null
  adubacao_solo_recomendacao: string | null
  adubacao_foliar_recomendacao: string | null
  controle_fungico_recomendacao: string | null
  poda_manutencao_recomendacao: string | null
  poda_fitossanitaria_recomendacao: string | null
  cultura_cobertura_recomendacao: string | null
  plantio_direto_recomendacao: string | null
  material_organico_recomendacao: string | null
  plano_adubacao_recomendacao: string | null
  mata_ciliar_recomendacao: string | null
  cerca_viva_recomendacao: string | null
  mip_recomendacao: string | null
  agricultura_precisao_recomendacao: string | null
  acoes_comunitarias_recomendacao: string | null
  casqueiro_recomendacao: string | null
  // Análises narrativas
  analise_tecnica_areas_cacau: string | null
  analise_boas_praticas: string | null
  analise_recomendacoes_proximo_ano: string | null
  analise_agricultura_regenerativa: string | null
  avaliacao_teto_produtivo: string | null
  created_at: string
  updated_at: string
}

export interface SyncQueueItem {
  id: string
  table_name: string
  operation: SyncOperation
  record_id: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
}

// Extended types with relations
export interface ProducerWithProperties extends Producer {
  properties?: Property[]
}

export interface VisitWithDetails extends Visit {
  producer?: Producer
  property?: Property
  records?: VisitRecord[]
  recommendations?: Recommendation[]
}

export interface FormWithFields extends Form {
  fields?: FormField[]
}
