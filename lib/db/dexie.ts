import Dexie, { type Table } from 'dexie'
import type {
  Producer,
  Property,
  Visit,
  VisitRecord,
  Recommendation,
  Form,
  FormField,
  FormResponse,
  FormAnswer,
  SyncQueueItem,
  ChecklistTemplate,
  ChecklistItem,
  Crop,
  VisitCrop,
  FinancialRecord,
  CacauObservacoesTecnicas,
} from '@/types'

export class ATERDatabase extends Dexie {
  producers!: Table<Producer>
  properties!: Table<Property>
  visits!: Table<Visit>
  visit_records!: Table<VisitRecord>
  recommendations!: Table<Recommendation>
  forms!: Table<Form>
  form_fields!: Table<FormField>
  form_responses!: Table<FormResponse>
  form_answers!: Table<FormAnswer>
  sync_queue!: Table<SyncQueueItem>
  checklist_templates!: Table<ChecklistTemplate>
  checklist_items!: Table<ChecklistItem>
  crops!: Table<Crop>
  visit_crops!: Table<VisitCrop>
  financial_records!: Table<FinancialRecord>
  cacau_observacoes_tecnicas!: Table<CacauObservacoesTecnicas>

  constructor() {
    super('ater-db')

    this.version(1).stores({
      producers: 'id, workspace_id, name, created_at',
      properties: 'id, workspace_id, producer_id, created_at',
      visits: 'id, workspace_id, technician_id, producer_id, property_id, status, started_at',
      visit_records: 'id, visit_id, workspace_id, type, created_at',
      forms: 'id, workspace_id, is_active, created_at',
      form_fields: 'id, form_id, order_index',
      form_responses: 'id, form_id, visit_id, producer_id, workspace_id',
      form_answers: 'id, response_id, field_id',
      sync_queue: 'id, table_name, operation, record_id, created_at',
    })

    this.version(2).stores({
      recommendations: 'id, visit_id, workspace_id, created_at',
    })

    this.version(3).stores({
      checklist_templates: 'id, workspace_id',
      checklist_items: 'id, visit_id, workspace_id',
    })

    // v4: adiciona status como campo indexado em producers
    this.version(4).stores({
      producers: 'id, workspace_id, name, status, created_at',
    })

    // v5: módulos culturas/safras, financeiro e cacau
    this.version(5).stores({
      crops: 'id, workspace_id, producer_id, property_id, culture, status, season_year',
      visit_crops: '[visit_id+crop_id], visit_id, crop_id',
      financial_records: 'id, workspace_id, producer_id, visit_id, crop_id, type, reference_date',
      cacau_observacoes_tecnicas: 'id, workspace_id, visit_id, crop_id',
    })
  }
}

export const db = new ATERDatabase()

// Helper to add item to sync queue
export async function enqueueSyncItem(
  table_name: string,
  operation: SyncQueueItem['operation'],
  record_id: string,
  payload: Record<string, unknown>
) {
  const { v4: uuidv4 } = await import('uuid')
  await db.sync_queue.add({
    id: uuidv4(),
    table_name,
    operation,
    record_id,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
  })
}
