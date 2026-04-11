'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FormRenderer } from '@/components/forms/form-renderer'
import type { Form, FormField, FormResponse, FormAnswer } from '@/types'

export default function FormDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { workspace } = useAuthStore()
  const [form, setForm] = useState<Form | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [showFill, setShowFill] = useState(false)
  const [responses, setResponses] = useState<FormResponse[]>([])

  useEffect(() => {
    async function load() {
      const f = await db.forms.get(id)
      if (!f) { router.push('/forms'); return }
      setForm(f)
      const flds = await db.form_fields.where('form_id').equals(id).sortBy('order_index')
      setFields(flds)
      const resp = await db.form_responses.where('form_id').equals(id).toArray()
      setResponses(resp)
    }
    load()
  }, [id, router])

  async function submitResponse(answers: Record<string, string | number | boolean | string[] | null>) {
    if (!workspace) return
    const responseId = uuidv4()
    const now = new Date().toISOString()

    const response: FormResponse = {
      id: responseId,
      form_id: id,
      visit_id: null,
      producer_id: null,
      workspace_id: workspace.id,
      submitted_at: now,
      created_at: now,
    }

    await db.form_responses.add(response)
    await enqueueSyncItem('form_responses', 'insert', responseId, response as unknown as Record<string, unknown>)

    for (const [fieldId, value] of Object.entries(answers)) {
      const field = fields.find((f) => f.id === fieldId)
      if (!field) continue

      const isDate    = field.type === 'date'
      const isNumeric = field.type === 'integer' || field.type === 'decimal' || field.type === 'number' || field.type === 'range'

      const answerId = uuidv4()
      const answer: FormAnswer = {
        id: answerId,
        response_id: responseId,
        field_id: fieldId,
        value_text:   (!isDate && !isNumeric && typeof value === 'string') ? value : null,
        value_number: (isNumeric && typeof value === 'number') ? value : null,
        value_date:   (isDate && typeof value === 'string') ? value : null,
        value_bool:   typeof value === 'boolean' ? value : null,
        value_json:   Array.isArray(value) ? value : null,
        media_url: null,
        created_at: now,
      }
      await db.form_answers.add(answer)
      await enqueueSyncItem('form_answers', 'insert', answerId, answer as unknown as Record<string, unknown>)
    }

    setResponses((prev) => [...prev, response])
    setShowFill(false)
  }

  async function toggleActive() {
    if (!form) return
    const updated = { ...form, is_active: !form.is_active, updated_at: new Date().toISOString() }
    await db.forms.update(id, { is_active: updated.is_active, updated_at: updated.updated_at })
    await enqueueSyncItem('forms', 'update', id, updated as unknown as Record<string, unknown>)
    setForm(updated)
  }

  if (!form) return <div className="p-8 text-center text-gray-400">Carregando...</div>

  return (
    <>
      <TopBar title={form.title} backHref="/forms" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Info */}
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{form.title}</h2>
              {form.description && <p className="text-sm text-gray-500 mt-1">{form.description}</p>}
              <p className="text-xs text-gray-400 mt-2">{fields.length} campo{fields.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={toggleActive}>
              <Badge variant={form.is_active ? 'green' : 'gray'}>
                {form.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </button>
          </div>
        </Card>

        {/* Fields preview */}
        <Card>
          <h3 className="font-medium text-gray-800 mb-3">Campos</h3>
          {fields.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum campo</p>
          ) : (
            <div className="flex flex-col gap-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-gray-400 text-sm w-5 text-center">{idx + 1}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-800">{field.label || '(sem título)'}</span>
                    <span className="text-xs text-gray-400 ml-2">{field.type}</span>
                  </div>
                  {field.required && <span className="text-xs text-red-500">obrigatório</span>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Responses */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-800">
              Respostas <span className="text-gray-400 font-normal text-sm">({responses.length})</span>
            </h3>
            {responses.length > 0 && (
              <Link href={`/forms/${id}/responses`} className="text-xs text-brand-600 font-medium">
                Ver todas →
              </Link>
            )}
          </div>
          {responses.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma resposta ainda</p>
          ) : (
            <p className="text-sm text-green-600">{responses.length} resposta{responses.length > 1 ? 's' : ''} registrada{responses.length > 1 ? 's' : ''}</p>
          )}
        </Card>

        {/* Fill form */}
        {form.is_active && !showFill && (
          <Button size="lg" className="w-full" onClick={() => setShowFill(true)}>
            Preencher formulário
          </Button>
        )}

        {showFill && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Preencher</h3>
              <button onClick={() => setShowFill(false)} className="text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FormRenderer fields={fields} onSubmit={submitResponse} />
          </Card>
        )}
      </div>
    </>
  )
}
