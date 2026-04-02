'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { db } from '@/lib/db/dexie'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Form, FormField, FormResponse, FormAnswer } from '@/types'
import { formatDateTime } from '@/lib/utils/dates'

type ResponseWithAnswers = FormResponse & { answers: FormAnswer[] }

function getAnswerDisplay(ans: FormAnswer): string {
  if (ans.value_text !== null && ans.value_text !== '') return ans.value_text
  if (ans.value_number !== null) return String(ans.value_number)
  if (ans.value_bool !== null) return ans.value_bool ? 'Sim' : 'Não'
  if (ans.value_json !== null) {
    if (Array.isArray(ans.value_json)) return (ans.value_json as string[]).join('; ')
    return String(ans.value_json)
  }
  if (ans.value_date !== null) return ans.value_date
  return '—'
}

export default function FormResponsesPage() {
  const { id } = useParams<{ id: string }>()
  const [form, setForm] = useState<Form | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [responses, setResponses] = useState<ResponseWithAnswers[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [f, flds, resps] = await Promise.all([
        db.forms.get(id),
        db.form_fields.where('form_id').equals(id).sortBy('order_index'),
        db.form_responses.where('form_id').equals(id).toArray(),
      ])
      setForm(f ?? null)
      setFields(flds)
      const enriched = await Promise.all(
        resps.map(async (r) => ({
          ...r,
          answers: await db.form_answers.where('response_id').equals(r.id).toArray(),
        }))
      )
      setResponses(enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    }
    load()
  }, [id])

  function exportCSV() {
    const visibleFields = fields.filter((f) => f.type !== 'calculate' && f.type !== 'hidden' && f.type !== 'note' && f.type !== 'begin_group' && f.type !== 'end_group')
    const headers = ['Data', 'Visita', ...visibleFields.map((f) => f.label || f.field_name || f.id)]
    const rows = responses.map((resp) => [
      formatDateTime(resp.created_at),
      resp.visit_id ?? '',
      ...visibleFields.map((field) => {
        const ans = resp.answers.find((a) => a.field_id === field.id)
        return ans ? getAnswerDisplay(ans) : ''
      }),
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${form?.title ?? 'respostas'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const visibleFields = fields.filter((f) => f.type !== 'calculate' && f.type !== 'hidden' && f.type !== 'note' && f.type !== 'begin_group' && f.type !== 'end_group')

  return (
    <>
      <TopBar title="Respostas" backHref={`/forms/${id}`} />
      <div className="px-4 py-4 flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">{form?.title}</p>
            <p className="text-sm text-gray-500">{responses.length} resposta{responses.length !== 1 ? 's' : ''}</p>
          </div>
          {responses.length > 0 && (
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5" />
              </svg>
              CSV
            </Button>
          )}
        </div>

        {responses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhuma resposta registrada ainda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {responses.map((resp, i) => (
              <Card key={resp.id} padding="sm">
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => setExpanded(expanded === resp.id ? null : resp.id)}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">
                      Resposta {responses.length - i}
                    </p>
                    <p className="text-xs text-gray-400">{formatDateTime(resp.created_at)}</p>
                    {resp.visit_id && (
                      <p className="text-xs text-brand-600">Vinculada a visita</p>
                    )}
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === resp.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expanded === resp.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-3">
                    {visibleFields.map((field) => {
                      const ans = resp.answers.find((a) => a.field_id === field.id)
                      const display = ans ? getAnswerDisplay(ans) : '—'
                      return (
                        <div key={field.id}>
                          <p className="text-xs font-medium text-gray-500">{field.label || field.field_name}</p>
                          <p className="text-sm text-gray-800 mt-0.5">{display}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
