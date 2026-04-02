import type { Visit, Producer, Property, VisitRecord, Recommendation } from '@/types'

const RECORD_TYPE_LABELS: Record<string, string> = {
  pest: 'Praga',
  disease: 'Doença',
  soil: 'Solo',
  management: 'Manejo',
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

const CATEGORY_LABELS: Record<string, string> = {
  fertilizacao: 'Fertilização',
  defensivo: 'Defensivo',
  irrigacao: 'Irrigação',
  manejo: 'Manejo',
  outro: 'Outro',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string, end: string) {
  const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export async function generateVisitPDF(params: {
  visit: Visit
  producer: Producer
  property: Property | null
  records: VisitRecord[]
  recommendations: Recommendation[]
  technicianName: string
}) {
  const { jsPDF } = await import('jspdf')
  const { visit, producer, property, records, recommendations, technicianName } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = 210
  const margin = 15
  const contentW = pageW - margin * 2
  let y = margin

  // ── Header ──────────────────────────────────────────────
  doc.setFillColor(22, 163, 74) // brand-600
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Relatório de Visita Técnica', margin, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('ATER — Assistência Técnica e Extensão Rural', margin, 19)
  doc.text(`Gerado em ${formatDate(new Date().toISOString())}`, pageW - margin, 19, { align: 'right' })

  y = 36
  doc.setTextColor(30, 30, 30)

  // ── Informações gerais ───────────────────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Informações da Visita', margin, y)
  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, margin + contentW, y)
  y += 5

  const infoLines = [
    ['Técnico', technicianName],
    ['Produtor', producer.name],
    ['Propriedade', property ? `${property.name} — ${property.municipality}` : '—'],
    ['Área', property?.area_ha ? `${property.area_ha} ha` : '—'],
    ['Início', formatDate(visit.started_at)],
    ['Encerramento', visit.ended_at ? formatDate(visit.ended_at) : '—'],
    ['Duração', visit.ended_at ? formatDuration(visit.started_at, visit.ended_at) : '—'],
    ['GPS', visit.gps_lat ? `${visit.gps_lat.toFixed(5)}, ${visit.gps_lng?.toFixed(5)}` : '—'],
  ]

  doc.setFontSize(9)
  for (const [label, value] of infoLines) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 35, y)
    y += 6
  }

  y += 4

  // ── Anotações ────────────────────────────────────────────
  if (visit.notes?.trim()) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Anotações', margin, y)
    y += 5
    doc.line(margin, y, margin + contentW, y)
    y += 5
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(visit.notes, contentW)
    doc.text(lines, margin, y)
    y += lines.length * 5 + 6
  }

  // ── Registros agronômicos ────────────────────────────────
  if (records.length > 0) {
    if (y > 240) { doc.addPage(); y = margin }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Registros Agronômicos', margin, y)
    y += 5
    doc.line(margin, y, margin + contentW, y)
    y += 5

    for (const rec of records) {
      if (y > 260) { doc.addPage(); y = margin }
      doc.setFillColor(245, 250, 245)
      doc.roundedRect(margin, y - 3, contentW, 20, 2, 2, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`${RECORD_TYPE_LABELS[rec.type] ?? rec.type} — Severidade: ${SEVERITY_LABELS[rec.severity] ?? rec.severity}`, margin + 3, y + 3)
      doc.setFont('helvetica', 'normal')
      const descLines = doc.splitTextToSize(rec.description, contentW - 6)
      doc.text(descLines, margin + 3, y + 9)
      y += Math.max(22, descLines.length * 5 + 12)
    }
    y += 4
  }

  // ── Recomendações técnicas ───────────────────────────────
  if (recommendations.length > 0) {
    if (y > 240) { doc.addPage(); y = margin }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Recomendações Técnicas', margin, y)
    y += 5
    doc.line(margin, y, margin + contentW, y)
    y += 5

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i]
      if (y > 260) { doc.addPage(); y = margin }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`${i + 1}. [${CATEGORY_LABELS[rec.category] ?? rec.category}]`, margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(rec.description, contentW - 5)
      doc.text(lines, margin + 4, y)
      y += lines.length * 5 + 5
    }
    y += 4
  }

  // ── Fotos ────────────────────────────────────────────────
  const photoUrls = visit.photo_urls ?? []
  if (photoUrls.length > 0) {
    if (y > 200) { doc.addPage(); y = margin }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Fotos da Visita', margin, y)
    y += 5
    doc.line(margin, y, margin + contentW, y)
    y += 6

    const photoW = (contentW - 6) / 3
    const photoH = photoW * 0.75
    let col = 0

    for (const url of photoUrls) {
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        const ext = blob.type.includes('png') ? 'PNG' : 'JPEG'
        const x = margin + col * (photoW + 3)
        if (y + photoH > 280) { doc.addPage(); y = margin; col = 0 }
        doc.addImage(dataUrl, ext, x, y, photoW, photoH)
        col++
        if (col >= 3) { col = 0; y += photoH + 3 }
      } catch {
        // Skip photos that fail to load
      }
    }
    if (col > 0) y += photoH + 3
    y += 4
  }

  // ── Assinatura ───────────────────────────────────────────
  if (visit.signature_url) {
    if (y > 240) { doc.addPage(); y = margin }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Assinatura do Produtor', margin, y)
    y += 5
    doc.line(margin, y, margin + contentW, y)
    y += 6
    try {
      const res = await fetch(visit.signature_url)
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      doc.addImage(dataUrl, 'PNG', margin, y, 80, 27)
      y += 32
    } catch { /* skip */ }
  }

  // ── Rodapé ───────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'normal')
    doc.text(`Plataforma ATER — Página ${i} de ${pageCount}`, pageW / 2, 292, { align: 'center' })
  }

  const filename = `visita-${producer.name.replace(/\s+/g, '-').toLowerCase()}-${visit.started_at.slice(0, 10)}.pdf`
  doc.save(filename)
}
