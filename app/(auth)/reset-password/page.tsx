'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres'); return }
    if (password !== confirm) { setError('Senhas não coincidem'); return }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError('Link expirado ou inválido. Solicite um novo link de redefinição.')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-600 to-brand-800 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-9 h-9 text-brand-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.66 19 7.66 17.11 9 16c2.83 2.83 5.17 5 6 8h2c-.83-3-3.17-5.17-6-8 2-1 4-2 6-2V8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Plataforma ATER</h1>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Nova senha</h2>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input
              label="Nova senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label="Confirmar senha"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              Redefinir senha
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
