import type { FieldType } from '@/types'
import type { DraftField } from '@/app/(app)/forms/new/page'

interface XLSSurveyRow {
  type?: string
  name?: string
  label?: string
  'label:Portuguese'?: string
  'label:pt'?: string
  hint?: string
  'hint:Portuguese'?: string
  required?: string | boolean
  'required message'?: string
  relevant?: string
  constraint?: string
  'constraint message'?: string
  default?: string
  appearance?: string
  parameters?: string
  'read only'?: string | boolean
  calculation?: string
}

interface XLSChoiceRow {
  list_name?: string
  name?: string
  label?: string
  'label:Portuguese'?: string
  'label:pt'?: string
}

// Map XLSForm types → our FieldType
const XLSFORM_TYPE_MAP: Record<string, FieldType> = {
  text: 'text',
  integer: 'integer',
  int: 'integer',
  decimal: 'decimal',
  float: 'decimal',
  note: 'note',
  select_one: 'select',
  select_multiple: 'select_multiple',
  geopoint: 'gps',
  geotrace: 'gps',
  geoshape: 'gps',
  date: 'date',
  time: 'time',
  datetime: 'datetime',
  image: 'photo',
  photo: 'photo',
  audio: 'audio',
  video: 'video',
  range: 'range',
  calculate: 'calculate',
  hidden: 'hidden',
  begin_group: 'begin_group',
  end_group: 'end_group',
  begin_repeat: 'begin_group',
  end_repeat: 'end_group',
}

function getLabel(row: XLSSurveyRow | XLSChoiceRow): string {
  return (
    row['label:Portuguese'] ??
    row['label:pt'] ??
    row.label ??
    ''
  ).toString().trim()
}

function getHint(row: XLSSurveyRow): string | null {
  const h = row['hint:Portuguese'] ?? row.hint
  return h ? h.toString().trim() || null : null
}

function isTruthy(val: string | boolean | undefined): boolean {
  if (typeof val === 'boolean') return val
  if (!val) return false
  return val.toLowerCase() === 'yes' || val.toLowerCase() === 'true' || val === '1'
}

export interface XLSFormResult {
  title: string
  fields: DraftField[]
}

export async function parseXLSForm(file: File): Promise<XLSFormResult> {
  const { read, utils } = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { type: 'array' })

  // ── Choices ──────────────────────────────────────────────
  const choicesSheet = wb.Sheets['choices'] ?? wb.Sheets['Choices']
  const choicesMap = new Map<string, string[]>()  // list_name → labels

  if (choicesSheet) {
    const rows = utils.sheet_to_json<XLSChoiceRow>(choicesSheet, { defval: '' })
    for (const row of rows) {
      const listName = row.list_name?.toString().trim()
      if (!listName) continue
      const label = getLabel(row) || row.name?.toString().trim() || ''
      if (label) {
        if (!choicesMap.has(listName)) choicesMap.set(listName, [])
        choicesMap.get(listName)!.push(label)
      }
    }
  }

  // ── Survey ────────────────────────────────────────────────
  const surveySheet = wb.Sheets['survey'] ?? wb.Sheets['Survey']
  if (!surveySheet) throw new Error('Planilha "survey" não encontrada no arquivo XLSForm')

  const rows = utils.sheet_to_json<XLSSurveyRow>(surveySheet, { defval: '' })
  const { v4: uuidv4 } = await import('uuid')

  // ── Settings (optional) ───────────────────────────────────
  const settingsSheet = wb.Sheets['settings'] ?? wb.Sheets['Settings']
  let formTitle = ''
  if (settingsSheet) {
    const settings = utils.sheet_to_json<Record<string, string>>(settingsSheet, { defval: '' })
    formTitle = settings[0]?.['form_title'] ?? settings[0]?.['title'] ?? ''
  }

  const fields: DraftField[] = []
  let orderIndex = 0

  for (const row of rows) {
    const rawType = row.type?.toString().trim() ?? ''
    if (!rawType) continue

    // Parse type — may be "select_one list_name" or "select_multiple list_name"
    let baseType = rawType
    let listName = ''

    if (rawType.startsWith('select_one ')) {
      baseType = 'select_one'
      listName = rawType.replace('select_one ', '').trim()
    } else if (rawType.startsWith('select_multiple ')) {
      baseType = 'select_multiple'
      listName = rawType.replace('select_multiple ', '').trim()
    }

    const fieldType = XLSFORM_TYPE_MAP[baseType]
    if (!fieldType) continue  // skip unknown types

    const label = getLabel(row as XLSSurveyRow)
    const fieldName = row.name?.toString().trim() || null
    const options = listName ? (choicesMap.get(listName) ?? null) : null

    const field: DraftField = {
      id: uuidv4(),
      field_name: fieldName,
      label,
      hint: getHint(row as XLSSurveyRow),
      type: fieldType,
      options,
      required: isTruthy(row.required),
      required_msg: row['required message']?.toString().trim() || null,
      relevant: row.relevant?.toString().trim() || null,
      constraint_expr: row.constraint?.toString().trim() || null,
      constraint_msg: row['constraint message']?.toString().trim() || null,
      default_value: row.default?.toString().trim() || null,
      appearance: row.appearance?.toString().trim() || null,
      parameters: row.parameters?.toString().trim() || null,
      read_only: isTruthy(row['read only']),
      calculation: row.calculation?.toString().trim() || null,
      order_index: orderIndex++,
    }

    fields.push(field)
  }

  return { title: formTitle, fields }
}

// ── XLSForm export ────────────────────────────────────────────
export async function exportXLSForm(
  title: string,
  fields: DraftField[]
): Promise<void> {
  const { utils, writeFile } = await import('xlsx')

  // survey sheet
  const surveyRows = fields.map((f) => {
    let typeStr: string = f.type
    if (f.type === 'select' && f.field_name) typeStr = `select_one ${f.field_name}_choices`
    if (f.type === 'select_multiple' && f.field_name) typeStr = `select_multiple ${f.field_name}_choices`

    return {
      type: typeStr,
      name: f.field_name || `q${f.order_index + 1}`,
      label: f.label,
      hint: f.hint ?? '',
      required: f.required ? 'yes' : '',
      'required message': f.required_msg ?? '',
      relevant: f.relevant ?? '',
      constraint: f.constraint_expr ?? '',
      'constraint message': f.constraint_msg ?? '',
      default: f.default_value ?? '',
      appearance: f.appearance ?? '',
      parameters: f.parameters ?? '',
      'read only': f.read_only ? 'yes' : '',
      calculation: f.calculation ?? '',
    }
  })

  // choices sheet
  const choiceRows: { list_name: string; name: string; label: string }[] = []
  for (const f of fields) {
    if ((f.type === 'select' || f.type === 'select_multiple') && f.options?.length) {
      const listName = `${f.field_name || `q${f.order_index + 1}`}_choices`
      f.options.forEach((opt, i) => {
        choiceRows.push({ list_name: listName, name: `opt${i + 1}`, label: opt })
      })
    }
  }

  // settings sheet
  const settingsRows = [{ form_title: title, form_id: title.toLowerCase().replace(/\s+/g, '_') }]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.json_to_sheet(surveyRows), 'survey')
  utils.book_append_sheet(wb, utils.json_to_sheet(choiceRows), 'choices')
  utils.book_append_sheet(wb, utils.json_to_sheet(settingsRows), 'settings')

  writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`)
}
