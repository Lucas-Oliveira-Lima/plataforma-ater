import { db } from '@/lib/db/dexie'
import { createClient } from '@/lib/supabase/client'

const SYNCABLE_TABLES = [
  'producers',
  'properties',
  'visits',
  'visit_records',
  'recommendations',
  'forms',
  'form_fields',
  'form_responses',
  'form_answers',
  'checklist_templates',
  'checklist_items',
  'crops',
  'visit_crops',
  'financial_records',
  'cacau_observacoes_tecnicas',
] as const

// Itens com attempts >= MAX_SKIP são pulados no auto-sync
// Itens com attempts >= MAX_DISCARD são removidos da fila
const MAX_SKIP = 5
const MAX_DISCARD = 10

export async function runSync(
  onProgress?: (pending: number) => void,
  force = false
): Promise<{ synced: number; errors: number; discarded: number }> {
  const supabase = createClient()
  const queue = await db.sync_queue.orderBy('created_at').toArray()

  if (queue.length === 0) return { synced: 0, errors: 0, discarded: 0 }

  let synced = 0
  let errors = 0
  let discarded = 0

  for (const item of queue) {
    onProgress?.(queue.length - synced - errors)

    // Descartar itens permanentemente falhos
    if (item.attempts >= MAX_DISCARD) {
      await db.sync_queue.delete(item.id)
      discarded++
      continue
    }

    // Pular no auto-sync itens com muitas falhas (retry manual via force=true)
    if (!force && item.attempts >= MAX_SKIP) {
      continue
    }

    // Rejeitar table_name fora da whitelist antes de qualquer chamada à API
    if (!SYNCABLE_TABLES.includes(item.table_name as typeof SYNCABLE_TABLES[number])) {
      await db.sync_queue.delete(item.id)
      discarded++
      continue
    }

    try {
      if (item.operation === 'insert' || item.operation === 'update') {
        const { error } = await supabase
          .from(item.table_name)
          .upsert(item.payload as Record<string, unknown>)
        if (error) throw error
      } else if (item.operation === 'delete') {
        const { error } = await supabase
          .from(item.table_name)
          .delete()
          .eq('id', item.record_id)
        if (error) throw error
      }

      await db.sync_queue.delete(item.id)
      synced++
    } catch {
      await db.sync_queue.update(item.id, { attempts: item.attempts + 1 })
      errors++
    }
  }

  return { synced, errors, discarded }
}

export async function getPendingCount(): Promise<number> {
  return db.sync_queue.count()
}

export async function getStuckCount(): Promise<number> {
  return db.sync_queue.where('attempts').aboveOrEqual(MAX_SKIP).count()
}

// Pull fresh data from Supabase into local IndexedDB
export async function pullFromSupabase(workspaceId: string) {
  const supabase = createClient()

  await Promise.all(
    SYNCABLE_TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)

      if (error || !data) return

      // @ts-expect-error dynamic table access
      await db[table].bulkPut(data)
    })
  )
}
