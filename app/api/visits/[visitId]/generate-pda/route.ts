import { createClient } from '@/lib/supabase/server'
import { generatePDA } from '@/lib/generate-pda'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { visitId } = await params
  const { format = 'pdf' } = await req.json() as { format?: 'pdf' | 'docx' }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response(null, { status: 401 })

  // Verificar que a visita pertence ao workspace do usuário
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!profile) return new Response(null, { status: 403 })

  const { data: visit } = await supabase
    .from('visits')
    .select('workspace_id, producer_id')
    .eq('id', visitId)
    .single()

  if (!visit || visit.workspace_id !== profile.workspace_id) {
    return new Response(null, { status: 403 })
  }

  try {
    const buffer = await generatePDA({ visitId, format, supabase })

    const contentType = format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const filename = `laudo-pda-${visitId}.${format}`

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Erro ao gerar PDA:', err)
    return new Response('Erro ao gerar o documento', { status: 500 })
  }
}
