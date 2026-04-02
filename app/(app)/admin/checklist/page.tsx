'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChecklistTemplate } from '@/types'

export default function ChecklistTemplatePage() {
  const router = useRouter()
  const { profile, workspace } = useAuthStore()
  const [items, setItems] = useState<ChecklistTemplate[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') { router.replace('/dashboard'); return }
    if (workspace) {
      db.checklist_templates.where('workspace_id').equals(workspace.id).sortBy('order_index').then(setItems)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, workspace])

  async function addItem() {
    if (!newLabel.trim() || !workspace) return
    setSaving(true)
    const id = uuidv4()
    const now = new Date().toISOString()
    const item: ChecklistTemplate = {
      id,
      workspace_id: workspace.id,
      label: newLabel.trim(),
      order_index: items.length,
      created_at: now,
    }
    await db.checklist_templates.add(item)
    await enqueueSyncItem('checklist_templates', 'insert', id, item as unknown as Record<string, unknown>)
    setItems((prev) => [...prev, item])
    setNewLabel('')
    setSaving(false)
  }

  async function removeItem(id: string) {
    await db.checklist_templates.delete(id)
    await enqueueSyncItem('checklist_templates', 'delete', id, { id })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <>
      <TopBar title="Checklist padrão" backHref="/admin" />
      <div className="px-4 py-4 flex flex-col gap-4">
        <p className="text-sm text-gray-500">
          Itens adicionados aqui aparecem automaticamente em toda nova visita.
        </p>

        {/* Add item */}
        <Card className="flex flex-col gap-3">
          <Input
            label="Novo item"
            placeholder="Ex: Verificar irrigação, Avaliar pragas..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <Button onClick={addItem} loading={saving} disabled={!newLabel.trim()}>
            Adicionar item
          </Button>
        </Card>

        {/* Item list */}
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum item no checklist padrão</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <Card key={item.id} padding="sm" className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium shrink-0">
                  {i + 1}
                </span>
                <p className="flex-1 text-sm text-gray-800">{item.label}</p>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
