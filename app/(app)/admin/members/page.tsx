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

export default function MembersPage() {
  const router = useRouter()
  const { profile, workspace } = useAuthStore()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') { router.replace('/dashboard'); return }
    load()
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

  return (
    <>
      <TopBar title="Técnicos" backHref="/admin" />
      <div className="px-4 py-4 flex flex-col gap-4">

        <Card padding="sm" className="bg-brand-50 border-brand-200">
          <p className="text-sm text-brand-700">
            <strong>Código de convite:</strong> compartilhe o código abaixo com novos técnicos.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <p className="flex-1 font-mono text-xs text-gray-700 bg-white rounded-lg px-3 py-2 border border-gray-200 break-all">
              {workspace?.id}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(workspace?.id ?? '')}
              className="p-2 text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            </button>
          </div>
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
