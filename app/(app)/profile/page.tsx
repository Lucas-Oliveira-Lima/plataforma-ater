'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { createClient } from '@/lib/supabase/client'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const ROLE_LABELS = { technician: 'Técnico', admin: 'Administrador' }

export default function ProfilePage() {
  const router = useRouter()
  const { profile, workspace, setProfile } = useAuthStore()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!profile || !name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', profile.id)

    if (err) {
      setError('Erro ao salvar. Verifique sua conexão.')
    } else {
      setProfile({ ...profile, full_name: name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <TopBar title="Meu Perfil" backHref="/dashboard" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Avatar */}
        <div className="flex flex-col items-center py-4 gap-3">
          <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center text-white text-3xl font-bold">
            {name.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 text-lg">{profile?.full_name}</p>
            <p className="text-sm text-gray-500">{workspace?.name}</p>
          </div>
          {profile?.role && (
            <Badge variant={profile.role === 'admin' ? 'blue' : 'green'}>
              {ROLE_LABELS[profile.role]}
            </Badge>
          )}
        </div>

        {/* Edit name */}
        <Card>
          <h3 className="font-medium text-gray-800 mb-3">Editar dados</h3>
          <div className="flex flex-col gap-3">
            <Input
              label="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={save} loading={saving} disabled={!name.trim() || name === profile?.full_name}>
              {saved ? 'Salvo!' : 'Salvar alterações'}
            </Button>
          </div>
        </Card>

        {/* Workspace info */}
        <Card>
          <h3 className="font-medium text-gray-800 mb-3">Organização</h3>
          <div className="flex flex-col gap-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span className="text-gray-500">Nome</span>
              <span className="font-medium text-gray-800">{workspace?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Função</span>
              <span className="font-medium text-gray-800">{profile?.role ? ROLE_LABELS[profile.role] : '—'}</span>
            </div>
          </div>
        </Card>

        {/* Invite technicians (admin only) */}
        {profile?.role === 'admin' && workspace && (
          <Card>
            <h3 className="font-medium text-gray-800 mb-1">Convidar técnico</h3>
            <p className="text-xs text-gray-500 mb-3">
              Compartilhe o código abaixo. O técnico deve usá-lo ao criar a conta em "Código de convite".
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
                <p className="text-xs font-mono text-gray-700 break-all">{workspace.id}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(workspace.id)
                }}
                className="p-2.5 bg-brand-50 text-brand-600 rounded-xl border border-brand-200 hover:bg-brand-100"
                title="Copiar código"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* Sign out */}
        <Button variant="danger" className="w-full mt-2" onClick={signOut}>
          Sair da conta
        </Button>
      </div>
    </>
  )
}
