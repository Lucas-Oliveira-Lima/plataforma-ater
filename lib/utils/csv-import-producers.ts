import type { ProducerSex, ProducerStatus } from '@/types'

export interface ProducerCSVRow {
  name: string
  phone: string | null
  email: string | null
  cpf_cnpj: string | null
  sex: ProducerSex | null
  state: string | null
  city: string | null
  locality: string | null
  status: ProducerStatus
  notes: string | null
}

// Normaliza cabeçalho: remove acentos, lowercase, sem espaços
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function parseSex(val: string): ProducerSex | null {
  const v = val.trim().toLowerCase()
  if (v === 'm' || v === 'masculino' || v === 'masc') return 'M'
  if (v === 'f' || v === 'feminino' || v === 'fem') return 'F'
  if (v === 'o' || v === 'outro' || v === 'outros') return 'O'
  if (v === 'n' || v === 'nao informado' || v === 'prefiro nao informar') return 'N'
  return null
}

function parseStatus(val: string): ProducerStatus {
  const v = val.trim().toLowerCase()
  if (v === 'inativo' || v === 'inactive') return 'inactive'
  return 'active'
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export interface CSVImportResult {
  rows: ProducerCSVRow[]
  errors: string[]
}

export function parseProducersCSV(text: string): CSVImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { rows: [], errors: ['Arquivo CSV vazio ou sem dados'] }
  }

  const rawHeaders = parseCSVLine(lines[0]).map(normalizeHeader)

  // Mapeamento de possíveis nomes de colunas para campos internos
  const HEADER_MAP: Record<string, string> = {
    nome: 'name', name: 'name',
    telefone: 'phone', phone: 'phone', celular: 'phone', tel: 'phone',
    email: 'email', 'e-mail': 'email',
    cpf: 'cpf_cnpj', cnpj: 'cpf_cnpj', cpf_cnpj: 'cpf_cnpj', 'cpf/cnpj': 'cpf_cnpj',
    sexo: 'sex', sex: 'sex', genero: 'sex',
    estado: 'state', state: 'state', uf: 'state',
    cidade: 'city', municipio: 'city', city: 'city',
    localidade: 'locality', locality: 'locality',
    status: 'status',
    observacoes: 'notes', notas: 'notes', notes: 'notes', obs: 'notes',
  }

  const fieldIndexes: Record<string, number> = {}
  for (let i = 0; i < rawHeaders.length; i++) {
    const mapped = HEADER_MAP[rawHeaders[i]]
    if (mapped) fieldIndexes[mapped] = i
  }

  if (fieldIndexes['name'] === undefined) {
    return { rows: [], errors: ['Coluna "nome" não encontrada. Verifique o cabeçalho do CSV.'] }
  }

  const rows: ProducerCSVRow[] = []
  const errors: string[] = []

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cells = parseCSVLine(lines[lineIdx])

    const get = (field: string) => {
      const idx = fieldIndexes[field]
      return idx !== undefined ? cells[idx]?.trim() ?? '' : ''
    }

    const name = get('name')
    if (!name) {
      errors.push(`Linha ${lineIdx + 1}: coluna "nome" vazia — linha ignorada`)
      continue
    }

    rows.push({
      name,
      phone:    get('phone') || null,
      email:    get('email') || null,
      cpf_cnpj: get('cpf_cnpj') || null,
      sex:      get('sex') ? parseSex(get('sex')) : null,
      state:    get('state') || null,
      city:     get('city') || null,
      locality: get('locality') || null,
      status:   get('status') ? parseStatus(get('status')) : 'active',
      notes:    get('notes') || null,
    })
  }

  return { rows, errors }
}
