'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) {
      setError('Erro ao enviar e-mail. Verifique o endereço e tente novamente.')
    } else {
      setSent(true)
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
          {sent ? (
            <div className="text-center flex flex-col gap-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">E-mail enviado!</h2>
              <p className="text-sm text-gray-500">
                Enviamos um link de redefinição para <strong>{email}</strong>.
                Verifique sua caixa de entrada (e o spam).
              </p>
              <Link href="/login" className="text-brand-600 font-medium text-sm">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Esqueci a senha</h2>
              <p className="text-sm text-gray-500 mb-6">
                Informe seu e-mail e enviaremos um link para redefinir a senha.
              </p>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <Input
                  label="E-mail"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
                  Enviar link
                </Button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-4">
                <Link href="/login" className="text-brand-600 font-medium">Voltar ao login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
