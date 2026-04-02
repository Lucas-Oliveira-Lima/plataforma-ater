import type { Producer, Property, Visit } from '@/types'

interface ExportData {
  producers: Producer[]
  properties: (Property & { producer_name?: string })[]
  visits: (Visit & { producer_name?: string; property_name?: string; technician_name?: string })[]
}

export async function exportToExcel(data: ExportData, workspaceName: string) {
  const { utils, writeFile } = await import('xlsx')

  const wb = utils.book_new()

  // ── Produtores ───────────────────────────────────────────
  const producerRows = data.producers.map((p) => ({
    'Nome': p.name,
    'Telefone': p.phone ?? '',
    'E-mail': p.email ?? '',
    'Observações': p.notes ?? '',
    'Cadastrado em': new Date(p.created_at).toLocaleDateString('pt-BR'),
  }))
  const wsProd = utils.json_to_sheet(producerRows)
  wsProd['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 16 }]
  utils.book_append_sheet(wb, wsProd, 'Produtores')

  // ── Propriedades ─────────────────────────────────────────
  const propRows = data.properties.map((p) => ({
    'Produtor': p.producer_name ?? '',
    'Nome da Propriedade': p.name,
    'Município': p.municipality,
    'Código CAR': p.car_code ?? '',
    'Área (ha)': p.area_ha ?? '',
    'Latitude': p.gps_lat ?? '',
    'Longitude': p.gps_lng ?? '',
  }))
  const wsProp = utils.json_to_sheet(propRows)
  wsProp['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
  utils.book_append_sheet(wb, wsProp, 'Propriedades')

  // ── Visitas ───────────────────────────────────────────────
  const visitRows = data.visits.map((v) => ({
    'Técnico': v.technician_name ?? '',
    'Produtor': v.producer_name ?? '',
    'Propriedade': v.property_name ?? '',
    'Status': v.status === 'active' ? 'Ativa' : v.status === 'completed' ? 'Concluída' : 'Agendada',
    'Agendada para': v.scheduled_at ? new Date(v.scheduled_at).toLocaleDateString('pt-BR') : '',
    'Início': new Date(v.started_at).toLocaleString('pt-BR'),
    'Encerramento': v.ended_at ? new Date(v.ended_at).toLocaleString('pt-BR') : '',
    'Anotações': v.notes ?? '',
    'Latitude': v.gps_lat ?? '',
    'Longitude': v.gps_lng ?? '',
    'Fotos': (v.photo_urls ?? []).length,
    'Áudios': (v.audio_urls ?? []).length,
  }))
  const wsVisit = utils.json_to_sheet(visitRows)
  wsVisit['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }]
  utils.book_append_sheet(wb, wsVisit, 'Visitas')

  const filename = `plataforma-ater-${workspaceName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`
  writeFile(wb, filename)
}
