'use client'
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { FormField } from '@/types'

export type AnswerValue = string | number | boolean | string[] | null

interface FormRendererProps {
  fields: FormField[]
  onSubmit: (answers: Record<string, AnswerValue>) => Promise<void>
}

// ── Skip logic evaluator ──────────────────────────────────────
function evaluateRelevant(expr: string, values: Record<string, AnswerValue>): boolean {
  if (!expr.trim()) return true
  try {
    // Replace ${field_name} references with their values
    let js = expr
      // ${name} = 'val' → values comparisons
      .replace(/\$\{([^}]+)\}/g, (_, name) => {
        const val = values[name]
        if (val === undefined || val === null || val === '') return "''"
        if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`
        if (typeof val === 'boolean') return val ? 'true' : 'false'
        if (Array.isArray(val)) return `'${val.join(' ')}'`
        return String(val)
      })
      // XLSForm operators → JS
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\bmod\b/gi, '%')
      .replace(/!=/g, '!==')
      // = not preceded by < > ! = → ===
      .replace(/(?<![<>!=])=(?!=)/g, '===')

    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`return (${js})`)())
  } catch {
    return true
  }
}

// ── Parse range parameters: "start=0 end=10 step=1" ──────────
function parseRange(params: string | null): { min: number; max: number; step: number } {
  const defaults = { min: 0, max: 10, step: 1 }
  if (!params) return defaults
  const get = (key: string, fallback: number) => {
    const m = params.match(new RegExp(`(?:^|\\s)${key}=(\\S+)`))
    return m ? parseFloat(m[1]) || fallback : fallback
  }
  return { min: get('start', 0), max: get('end', 10), step: get('step', 1) }
}

// ── Evaluate calculation ──────────────────────────────────────
function evaluateCalculation(expr: string, values: Record<string, AnswerValue>): string {
  if (!expr) return ''
  try {
    const js = expr.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const val = values[name]
      return (val !== undefined && val !== null && val !== '') ? String(val) : '0'
    })
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${js})`)()
    return result !== undefined && result !== null ? String(result) : ''
  } catch {
    return ''
  }
}

export function FormRenderer({ fields, onSubmit }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, AnswerValue>>(() => {
    // Pre-fill defaults
    const init: Record<string, AnswerValue> = {}
    for (const f of fields) {
      if (f.field_name && f.default_value !== null && f.default_value !== undefined) {
        init[f.field_name] = f.default_value
      }
    }
    return init
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const key = (f: FormField) => f.field_name || f.id

  function setValue(field: FormField, value: AnswerValue) {
    const k = key(field)
    setValues((prev) => ({ ...prev, [k]: value }))
    setErrors((prev) => { const n = { ...prev }; delete n[k]; return n })
  }

  // Recalculate calculate fields whenever values change
  const computedValues = useMemo(() => {
    const result = { ...values }
    for (const f of fields) {
      if (f.type === 'calculate' && f.calculation) {
        result[key(f)] = evaluateCalculation(f.calculation, result)
      }
    }
    return result
  }, [values, fields])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (f.type === 'calculate' || f.type === 'hidden' || f.type === 'note') continue
      if (!evaluateRelevant(f.relevant ?? '', computedValues)) continue  // hidden by skip logic
      const k = key(f)
      const val = computedValues[k]
      const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
      if (f.required && isEmpty) {
        errs[k] = f.required_msg || 'Campo obrigatório'
      }
      if (!isEmpty && f.constraint_expr) {
        try {
          const valid = evaluateRelevant(
            f.constraint_expr.replace(/\.\s/g, `\${${k}} `).replace(/^\.$/g, `\${${k}}`),
            computedValues
          )
          if (!valid) errs[k] = f.constraint_msg || 'Valor inválido'
        } catch { /* ignore */ }
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    // Merge computed values for calculate fields
    await onSubmit(computedValues)
    setSubmitting(false)
  }

  // Group stack for visual nesting
  let depth = 0

  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        // Skip logic
        const visible = evaluateRelevant(field.relevant ?? '', computedValues)
        if (!visible) return null

        const k = key(field)
        const err = errors[k]

        // Groups
        if (field.type === 'begin_group') {
          depth++
          return (
            <div key={field.id} className="border-l-2 border-brand-200 pl-3">
              {field.label && <p className="text-sm font-semibold text-brand-700 mb-3">{field.label}</p>}
            </div>
          )
        }
        if (field.type === 'end_group') {
          depth = Math.max(0, depth - 1)
          return <div key={field.id} className="border-t border-gray-100 my-1" />
        }

        // Hidden
        if (field.type === 'hidden' || field.type === 'calculate') return null

        return (
          <div key={field.id} className="flex flex-col gap-1.5">
            {/* Label */}
            {field.type !== 'note' && (
              <label className="text-sm font-medium text-gray-700">
                {field.label || '(campo sem título)'}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
            )}

            {/* Hint */}
            {field.hint && field.type !== 'note' && (
              <p className="text-xs text-gray-500 -mt-0.5">{field.hint}</p>
            )}

            {/* ── Field types ── */}

            {field.type === 'note' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-sm text-blue-800">{field.label}</p>
                {field.hint && <p className="text-xs text-blue-600 mt-1">{field.hint}</p>}
              </div>
            )}

            {(field.type === 'text') && (
              <input type="text" className={fc(err)} value={(computedValues[k] as string) ?? field.default_value ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value)} />
            )}

            {(field.type === 'integer' || field.type === 'number') && (
              <input type="number" step="1" className={fc(err)} value={(computedValues[k] as number) ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value === '' ? null : parseInt(e.target.value, 10))} />
            )}

            {field.type === 'decimal' && (
              <input type="number" step="any" className={fc(err)} value={(computedValues[k] as number) ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value === '' ? null : parseFloat(e.target.value))} />
            )}

            {field.type === 'date' && (
              <input type="date" className={fc(err)} value={(computedValues[k] as string) ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value)} />
            )}

            {field.type === 'time' && (
              <input type="time" className={fc(err)} value={(computedValues[k] as string) ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value)} />
            )}

            {field.type === 'datetime' && (
              <input type="datetime-local" className={fc(err)} value={(computedValues[k] as string) ?? ''} readOnly={field.read_only} onChange={(e) => setValue(field, e.target.value)} />
            )}

            {field.type === 'select' && (
              <div className="flex flex-col gap-2">
                {(field.options ?? []).map((opt) => (
                  <label key={opt} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${computedValues[k] === opt ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${computedValues[k] === opt ? 'border-brand-500' : 'border-gray-300'}`}>
                      {computedValues[k] === opt && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                    </span>
                    <input type="radio" className="hidden" checked={computedValues[k] === opt} onChange={() => setValue(field, opt)} />
                    <span className="text-sm text-gray-700">{opt}</span>
                  </label>
                ))}
                {field.appearance === 'minimal' && (
                  <select className={fc(err)} value={(computedValues[k] as string) ?? ''} onChange={(e) => setValue(field, e.target.value)}>
                    <option value="">Selecione...</option>
                    {(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
              </div>
            )}

            {field.type === 'select_multiple' && (
              <div className="flex flex-col gap-2">
                {(field.options ?? []).map((opt) => {
                  const selected = ((computedValues[k] as string[]) ?? []).includes(opt)
                  return (
                    <label key={opt} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-brand-500 bg-brand-500' : 'border-gray-300'}`}>
                        {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                      </span>
                      <input type="checkbox" className="hidden" checked={selected} onChange={() => {
                        const current = (computedValues[k] as string[]) ?? []
                        setValue(field, selected ? current.filter((v) => v !== opt) : [...current, opt])
                      }} />
                      <span className="text-sm text-gray-700">{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {field.type === 'checkbox' && (
              <div className="flex gap-3">
                {['Sim', 'Não'].map((opt) => (
                  <button key={opt} type="button"
                    onClick={() => setValue(field, opt === 'Sim')}
                    className={`flex-1 py-3 rounded-xl border-2 font-medium text-base transition-colors ${(opt === 'Sim' && computedValues[k] === true) || (opt === 'Não' && computedValues[k] === false) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}
                  >{opt}</button>
                ))}
              </div>
            )}

            {field.type === 'range' && (() => {
              const { min, max, step } = parseRange(field.parameters)
              const val = (computedValues[k] as number) ?? min
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{min}</span>
                    <span className="text-base font-bold text-brand-700">{val}</span>
                    <span>{max}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={val} className="w-full accent-brand-600" disabled={field.read_only} onChange={(e) => setValue(field, parseFloat(e.target.value))} />
                </div>
              )
            })()}

            {field.type === 'gps' && (
              <GpsField value={(computedValues[k] as string) ?? ''} onChange={(v) => setValue(field, v)} readonly={field.read_only} />
            )}

            {(field.type === 'photo' || field.type === 'audio' || field.type === 'video') && (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center">
                <p className="text-gray-400 text-sm">
                  {field.type === 'photo' ? '📷 Foto' : field.type === 'audio' ? '🎤 Áudio' : '🎥 Vídeo'} — disponível durante visita
                </p>
              </div>
            )}

            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        )
      })}

      <Button size="lg" className="w-full mt-2" loading={submitting} onClick={handleSubmit}>
        Enviar respostas
      </Button>
    </div>
  )
}

function fc(error?: string): string {
  return `w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`
}

function GpsField({ value, onChange, readonly }: { value: string; onChange: (v: string) => void; readonly?: boolean }) {
  const [loading, setLoading] = useState(false)

  function capture() {
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`)
        setLoading(false)
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Latitude, Longitude"
        value={value}
        readOnly={readonly}
        onChange={(e) => onChange(e.target.value)}
      />
      {!readonly && (
        <Button variant="secondary" onClick={capture} loading={loading}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </Button>
      )}
    </div>
  )
}
