'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/types'

const ROLE_LABELS = { technician: 'Técnico', admin: 'Administrador' }

interface InviteRecord {
  id: string
  token: string
  expires_at: string
  used_at: string | null
}

export default function MembersPage() {
  const router = useRouter()
  const { profile, workspace } = useAuthStore()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteRecord | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') { router.replace('/dashboard'); return }
    load()
    loadInvite()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function load() {
    if (!workspace) return
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('full_name')
    if (data) setMembers(data as Profile[])
    setLoading(false)
  }

  async function loadInvite() {
    if (!workspace) return
    const supabase = createClient()
    // Busca o convite ativo mais recente deste workspace
    const { data } = await supabase
      .from('workspace_invites')
      .select('id, token, expires_at, used_at')
      .eq('workspace_id', workspace.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) setInvite(data as InviteRecord)
  }

  async function generateInvite() {
    if (!workspace || !profile) return
    setGeneratingInvite(true)
    try {
      const supabase = createClient()
      // Token: 4 grupos de 4 chars hexadecimais → legível e copiável
      const raw = crypto.getRandomValues(new Uint8Array(8))
      const hex = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')
      const token = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`.toUpperCase()

      const { data, error } = await supabase
        .from('workspace_invites')
        .insert({
          workspace_id: workspace.id,
          token,
          created_by: profile.id,
        })
        .select('id, token, expires_at, used_at')
        .single()

      if (!error && data) setInvite(data as InviteRecord)
    } finally {
      setGeneratingInvite(false)
    }
  }

  async function copyToken() {
    if (!invite) return
    await navigator.clipboard.writeText(invite.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!confirm(`Remover ${memberName} da organização? Ele não terá mais acesso.`)) return
    setRemoving(memberId)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ workspace_id: null })
      .eq('id', memberId)

    if (error) {
      alert('Erro ao remover membro. Verifique sua conexão.')
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    }
    setRemoving(null)
  }

  const expiresLabel = invite
    ? new Date(invite.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <>
      <TopBar title="Técnicos" backHref="/admin" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Convite */}
        <Card padding="sm" className="bg-brand-50 border-brand-200">
          <p className="text-sm font-medium text-brand-800 mb-2">Código de convite</p>

          {invite ? (
            <>
              <p className="text-xs text-brand-600 mb-2">
                Compartilhe este código com novos técnicos. Válido até {expiresLabel}.
              </p>
              <div className="flex items-center gap-2">
                <p className="flex-1 font-mono text-sm font-semibold text-gray-800 bg-white rounded-lg px-3 py-2 border border-gray-200 tracking-widest">
                  {invite.token}
                </p>
                <button
                  onClick={copyToken}
                  className="p-2 text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 shrink-0"
                  title="Copiar código"
                >
                  {copied ? (
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                onClick={generateInvite}
                disabled={generatingInvite}
                className="mt-2 text-xs text-brand-600 hover:text-brand-800 underline"
              >
                Gerar novo código (invalida o atual)
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-brand-600 mb-3">
                Nenhum código ativo. Gere um para convidar técnicos.
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={generatingInvite}
                onClick={generateInvite}
              >
                Gerar código de convite
              </Button>
            </>
          )}
        </Card>

        <h3 className="font-semibold text-gray-900">Membros ({members.length})</h3>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <Card key={m.id} padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold shrink-0">
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm truncate">{m.full_name}</p>
                      {m.id === profile?.id && <span className="text-xs text-gray-400">(você)</span>}
                    </div>
                    <Badge variant={m.role === 'admin' ? 'blue' : 'green'}>
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  </div>
                  {m.id !== profile?.id && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={removing === m.id}
                      onClick={() => removeMember(m.id, m.full_name)}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
