export type UserRole = 'technician' | 'admin'
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
