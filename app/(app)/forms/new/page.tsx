'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { FormBuilder } from '@/components/forms/form-builder'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { FormField, FieldType } from '@/types'

export type DraftField = Omit<FormField, 'form_id' | 'created_at'>

export default function NewFormPage() {
  const router = useRouter()
  const { workspace } = useAuthStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<DraftField[]>([])
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const xlsInputRef = useRef<HTMLInputElement>(null)

  async function saveForm() {
    if (!title.trim() || !workspace) return
    setSaving(true)

    const formId = uuidv4()
    const now = new Date().toISOString()

    const form = {
      id: formId,
      workspace_id: workspace.id,
      title,
      description: description || null,
      is_active: true,
      created_at: now,
      updated_at: now,
    }

    await db.forms.add(form)
    await enqueueSyncItem('forms', 'insert', formId, form as unknown as Record<string, unknown>)

    for (const field of fields) {
      const fieldRecord: FormField = { ...field, form_id: formId, created_at: now }
      await db.form_fields.add(fieldRecord)
      await enqueueSyncItem('form_fields', 'insert', field.id, fieldRecord as unknown as Record<string, unknown>)
    }

    setSaving(false)
    router.push(`/forms/${formId}`)
  }

  function addField(type: FieldType) {
    const newField: DraftField = {
      id: uuidv4(),
      field_name: null,
      label: '',
      hint: null,
      type,
      options: (type === 'select' || type === 'select_multiple') ? [] : null,
      required: false,
      required_msg: null,
      relevant: null,
      constraint_expr: null,
      constraint_msg: null,
      default_value: null,
      appearance: null,
      parameters: type === 'range' ? 'start=0 end=10 step=1' : null,
      read_only: false,
      calculation: null,
      order_index: fields.length,
    }
    setFields((prev) => [...prev, newField])
  }

  function updateField(id: string, updates: Partial<DraftField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, order_index: i })))
  }

  function moveField(id: string, direction: 'up' | 'down') {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next.map((f, i) => ({ ...f, order_index: i }))
    })
  }

  async function handleXLSImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const { parseXLSForm } = await import('@/lib/utils/xlsform-import')
      const result = await parseXLSForm(file)
      if (result.title && !title) setTitle(result.title)
      setFields(result.fields)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar arquivo')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function handleXLSExport() {
    if (!title.trim() || fields.length === 0) return
    const { exportXLSForm } = await import('@/lib/utils/xlsform-import')
    await exportXLSForm(title, fields)
  }

  return (
    <>
      <TopBar title="Novo Formulário" backHref="/forms" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* XLS Import/Export */}
        <div className="flex gap-2">
          <input ref={xlsInputRef} type="file" accept=".xlsx,.xls,.ods" className="hidden" onChange={handleXLSImport} />
          <Button
            variant="secondary"
            className="flex-1"
            loading={importing}
            onClick={() => xlsInputRef.current?.click()}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Importar XLSForm
          </Button>
          {fields.length > 0 && (
            <Button variant="ghost" onClick={handleXLSExport}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5" />
              </svg>
            </Button>
          )}
        </div>

        {importError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{importError}</p>
        )}

        <Input
          label="Título do formulário"
          placeholder="Ex: Diagnóstico de Pragas"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Descrição (opcional)"
          placeholder="Descreva quando usar este formulário..."
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <FormBuilder
          fields={fields}
          onAddField={addField}
          onUpdateField={updateField}
          onRemoveField={removeField}
          onMoveField={moveField}
        />

        <Button
          size="lg"
          className="w-full mt-2"
          disabled={!title.trim() || fields.length === 0}
          loading={saving}
          onClick={saveForm}
        >
          Salvar formulário ({fields.length} campo{fields.length !== 1 ? 's' : ''})
        </Button>
      </div>
    </>
  )
}
