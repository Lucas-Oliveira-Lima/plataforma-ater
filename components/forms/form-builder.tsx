'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FieldType } from '@/types'
import type { DraftField } from '@/app/(app)/forms/new/page'

// ── Field type palette ────────────────────────────────────────
const FIELD_GROUPS: { label: string; fields: { type: FieldType; label: string; icon: string }[] }[] = [
  {
    label: 'Texto',
    fields: [
      { type: 'text', label: 'Texto', icon: 'T' },
      { type: 'integer', label: 'Inteiro', icon: '1' },
      { type: 'decimal', label: 'Decimal', icon: '1.5' },
      { type: 'note', label: 'Nota', icon: '💬' },
    ],
  },
  {
    label: 'Escolha',
    fields: [
      { type: 'select', label: 'Única', icon: '◉' },
      { type: 'select_multiple', label: 'Múltipla', icon: '☑' },
      { type: 'checkbox', label: 'Sim/Não', icon: '✓' },
    ],
  },
  {
    label: 'Data/Hora',
    fields: [
      { type: 'date', label: 'Data', icon: '📅' },
      { type: 'time', label: 'Hora', icon: '🕐' },
      { type: 'datetime', label: 'Data+Hora', icon: '🗓' },
    ],
  },
  {
    label: 'Localização e Mídia',
    fields: [
      { type: 'gps', label: 'GPS', icon: '📍' },
      { type: 'photo', label: 'Foto', icon: '📷' },
      { type: 'audio', label: 'Áudio', icon: '🎤' },
      { type: 'video', label: 'Vídeo', icon: '🎥' },
    ],
  },
  {
    label: 'Avançado',
    fields: [
      { type: 'range', label: 'Intervalo', icon: '↔' },
      { type: 'calculate', label: 'Calcular', icon: 'fx' },
      { type: 'hidden', label: 'Oculto', icon: '👁' },
      { type: 'begin_group', label: 'Grupo', icon: '[]' },
    ],
  },
]

const ALL_TYPE_LABELS = FIELD_GROUPS.flatMap((g) => g.fields).reduce(
  (acc, f) => { acc[f.type] = f.label; return acc },
  {} as Record<string, string>
)

interface FormBuilderProps {
  fields: DraftField[]
  onAddField: (type: FieldType) => void
  onUpdateField: (id: string, updates: Partial<DraftField>) => void
  onRemoveField: (id: string) => void
  onMoveField: (id: string, direction: 'up' | 'down') => void
}

export function FormBuilder({ fields, onAddField, onUpdateField, onRemoveField, onMoveField }: FormBuilderProps) {
  const [showPalette, setShowPalette] = useState(fields.length === 0)

  return (
    <div className="flex flex-col gap-4">
      {fields.length > 0 && (
        <div className="flex flex-col gap-3">
          {fields.map((field, idx) => (
            <FieldEditor
              key={field.id}
              field={field}
              isFirst={idx === 0}
              isLast={idx === fields.length - 1}
              allFields={fields}
              onUpdate={(updates) => onUpdateField(field.id, updates)}
              onRemove={() => onRemoveField(field.id)}
              onMove={(dir) => onMoveField(field.id, dir)}
            />
          ))}
        </div>
      )}

      {/* Add field palette */}
      <Card padding="sm">
        <button
          className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-0"
          onClick={() => setShowPalette((v) => !v)}
        >
          <span>+ Adicionar campo</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showPalette ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showPalette && (
          <div className="mt-3 flex flex-col gap-4">
            {FIELD_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
                <div className="grid grid-cols-4 gap-2">
                  {group.fields.map(({ type, label, icon }) => (
                    <button
                      key={type}
                      onClick={() => { onAddField(type); setShowPalette(false) }}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100 transition-colors"
                    >
                      <span className="text-base font-bold text-gray-600">{icon}</span>
                      <span className="text-[9px] text-gray-600 font-medium leading-tight text-center">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Field Editor ──────────────────────────────────────────────
function FieldEditor({
  field,
  isFirst,
  isLast,
  allFields,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: DraftField
  isFirst: boolean
  isLast: boolean
  allFields: DraftField[]
  onUpdate: (updates: Partial<DraftField>) => void
  onRemove: () => void
  onMove: (dir: 'up' | 'down') => void
}) {
  const [showLogic, setShowLogic] = useState(!!field.relevant)
  const [showValidation, setShowValidation] = useState(!!field.constraint_expr)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const typeLabel = ALL_TYPE_LABELS[field.type] ?? field.type
  const hasOptions = field.type === 'select' || field.type === 'select_multiple'
  const isGroup = field.type === 'begin_group' || field.type === 'end_group'
  const isCalculate = field.type === 'calculate'
  const isRange = field.type === 'range'
  const isNote = field.type === 'note'

  // Auto-generate field_name from label
  function handleLabelChange(label: string) {
    const autoName = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50)
    onUpdate({ label, field_name: autoName || field.field_name })
  }

  // References to other fields for skip logic autocomplete
  const otherFields = allFields.filter((f) => f.id !== field.id && f.field_name)

  if (isGroup && field.type === 'end_group') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 border-t-2 border-dashed border-gray-200" />
        <span className="text-xs text-gray-400 font-medium">fim do grupo</span>
        <div className="flex-1 border-t-2 border-dashed border-gray-200" />
        <button onClick={onRemove} className="p-1 text-red-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <Card padding="sm" className="flex flex-col gap-3 border-l-4 border-brand-300">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full shrink-0">
          {typeLabel}
        </span>
        <div className="flex-1" />
        <button onClick={() => onMove('up')} disabled={isFirst} className="p-1 text-gray-400 disabled:opacity-30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
        <button onClick={() => onMove('down')} disabled={isLast} className="p-1 text-gray-400 disabled:opacity-30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <button onClick={onRemove} className="p-1 text-red-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Label */}
      {!isGroup && (
        <Input
          placeholder={isNote ? 'Texto da nota/instrução...' : `Pergunta (${typeLabel})`}
          value={field.label}
          onChange={(e) => handleLabelChange(e.target.value)}
        />
      )}

      {isGroup && (
        <Input
          placeholder="Nome do grupo"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      )}

      {/* Field name display */}
      {field.field_name && (
        <p className="text-xs text-gray-400 font-mono -mt-1">
          Referência: <span className="text-brand-600">${'{'}{ field.field_name }{'}'}</span>
        </p>
      )}

      {/* Hint */}
      {!isGroup && !isNote && (
        <input
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          placeholder="Dica (opcional) — aparece abaixo da pergunta"
          value={field.hint ?? ''}
          onChange={(e) => onUpdate({ hint: e.target.value || null })}
        />
      )}

      {/* Select options */}
      {hasOptions && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-gray-500">Opções (uma por linha)</p>
          <textarea
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            rows={4}
            placeholder={"Opção 1\nOpção 2\nOpção 3"}
            value={(field.options ?? []).join('\n')}
            onChange={(e) => onUpdate({ options: e.target.value.split('\n').filter(Boolean) })}
          />
        </div>
      )}

      {/* Range parameters */}
      {isRange && (
        <input
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
          placeholder="start=0 end=10 step=1"
          value={field.parameters ?? ''}
          onChange={(e) => onUpdate({ parameters: e.target.value || null })}
        />
      )}

      {/* Calculate expression */}
      {isCalculate && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-gray-500">Expressão de cálculo</p>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="${campo1} + ${campo2}"
            value={field.calculation ?? ''}
            onChange={(e) => onUpdate({ calculation: e.target.value || null })}
          />
          {otherFields.length > 0 && (
            <p className="text-xs text-gray-400">
              Campos disponíveis: {otherFields.map((f) => `\${${f.field_name}}`).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Required + Read only */}
      {!isGroup && !isNote && !isCalculate && (
        <div className="flex gap-4">
          <Toggle
            checked={field.required}
            onChange={(v) => onUpdate({ required: v })}
            label="Obrigatório"
          />
          <Toggle
            checked={field.read_only}
            onChange={(v) => onUpdate({ read_only: v })}
            label="Somente leitura"
          />
        </div>
      )}

      {/* Skip Logic */}
      {!isGroup && (
        <CollapsibleSection
          label="Lógica de pulo (skip logic)"
          open={showLogic}
          onToggle={() => setShowLogic((v) => !v)}
          hasContent={!!field.relevant}
        >
          <div className="flex flex-col gap-1.5">
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="${outra_pergunta}='sim'"
              value={field.relevant ?? ''}
              onChange={(e) => onUpdate({ relevant: e.target.value || null })}
            />
            {otherFields.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {otherFields.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onUpdate({ relevant: (field.relevant ?? '') + `\${${f.field_name}}` })}
                    className="text-xs bg-gray-100 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-2 py-0.5 rounded font-mono"
                  >
                    ${'{'}{ f.field_name }{'}'}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Ex: <code className="bg-gray-100 px-1 rounded">${'{campo}'}='sim'</code> · <code className="bg-gray-100 px-1 rounded">${'{num}'}&gt;5</code> · <code className="bg-gray-100 px-1 rounded">and</code> / <code className="bg-gray-100 px-1 rounded">or</code>
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Validation / Constraint */}
      {!isGroup && !isNote && (
        <CollapsibleSection
          label="Validação"
          open={showValidation}
          onToggle={() => setShowValidation((v) => !v)}
          hasContent={!!field.constraint_expr}
        >
          <div className="flex flex-col gap-2">
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder=". >= 0 and . <= 100"
              value={field.constraint_expr ?? ''}
              onChange={(e) => onUpdate({ constraint_expr: e.target.value || null })}
            />
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Mensagem de erro (ex: Valor deve ser entre 0 e 100)"
              value={field.constraint_msg ?? ''}
              onChange={(e) => onUpdate({ constraint_msg: e.target.value || null })}
            />
          </div>
        </CollapsibleSection>
      )}

      {/* Advanced */}
      <CollapsibleSection
        label="Avançado"
        open={showAdvanced}
        onToggle={() => setShowAdvanced((v) => !v)}
        hasContent={!!(field.default_value || field.appearance || field.required_msg)}
      >
        <div className="flex flex-col gap-2">
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Valor padrão"
            value={field.default_value ?? ''}
            onChange={(e) => onUpdate({ default_value: e.target.value || null })}
          />
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Mensagem de campo obrigatório"
            value={field.required_msg ?? ''}
            onChange={(e) => onUpdate({ required_msg: e.target.value || null })}
          />
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Aparência (minimal, compact, likert...)"
            value={field.appearance ?? ''}
            onChange={(e) => onUpdate({ appearance: e.target.value || null })}
          />
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Nome do campo (XLSForm name)"
            value={field.field_name ?? ''}
            onChange={(e) => onUpdate({ field_name: e.target.value || null })}
          />
        </div>
      </CollapsibleSection>
    </Card>
  )
}

// ── Helpers ───────────────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-brand-600' : 'bg-gray-200'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs text-gray-600">{label}</span>
    </label>
  )
}

function CollapsibleSection({
  label, open, onToggle, hasContent, children,
}: {
  label: string; open: boolean; onToggle: () => void; hasContent: boolean; children: React.ReactNode
}) {
  return (
    <div className="border-t border-gray-100 pt-2">
      <button
        className="flex items-center gap-2 text-xs font-medium text-gray-500 w-full"
        onClick={onToggle}
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {label}
        {hasContent && !open && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-auto" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}
