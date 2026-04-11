'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

type FormData = z.infer<typeof schema>

// Bloqueio progressivo: 3 falhas = 30s, 5+ falhas = 5 min
const LOCKOUT_THRESHOLDS: [number, number][] = [
  [5, 5 * 60 * 1000],
  [3, 30 * 1000],
]

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const failedAttempts = useRef(0)
  const lockedUntil = useRef<number | null>(null)
  const [lockMsg, setLockMsg] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    // Verificar lockout ativo
    if (lockedUntil.current && Date.now() < lockedUntil.current) {
      const secs = Math.ceil((lockedUntil.current - Date.now()) / 1000)
      setLockMsg(`Muitas tentativas. Aguarde ${secs}s antes de tentar novamente.`)
      return
    }
    setLockMsg(null)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      failedAttempts.current += 1
      const attempts = failedAttempts.current

      for (const [threshold, delay] of LOCKOUT_THRESHOLDS) {
        if (attempts >= threshold) {
          lockedUntil.current = Date.now() + delay
          const secs = delay / 1000 >= 60 ? `${delay / 60000} min` : `${delay / 1000}s`
          setLockMsg(`Muitas tentativas. Aguarde ${secs} antes de tentar novamente.`)
          break
        }
      }

      setError('E-mail ou senha inválidos')
      return
    }

    failedAttempts.current = 0
    lockedUntil.current = null
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-600 to-brand-800 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-9 h-9 text-brand-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.66 19 7.66 17.11 9 16c2.83 2.83 5.17 5 6 8h2c-.83-3-3.17-5.17-6-8 2-1 4-2 6-2V8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Plataforma ATER</h1>
          <p className="text-brand-200 text-sm mt-1">Assistência Técnica Rural</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Entrar</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            {lockMsg && (
              <div className="bg-orange-50 text-orange-700 rounded-xl px-4 py-3 text-sm">
                {lockMsg}
              </div>
            )}

            {error && !lockMsg && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              loading={isSubmitting}
              disabled={!!(lockedUntil.current && Date.now() < lockedUntil.current)}
              className="mt-2 w-full"
            >
              Entrar
            </Button>
          </form>

          <div className="flex flex-col items-center gap-2 mt-4">
            <Link href="/forgot-password" className="text-sm text-gray-400 hover:text-brand-600">
              Esqueci minha senha
            </Link>
            <p className="text-sm text-gray-500">
              Não tem conta?{' '}
              <Link href="/register" className="text-brand-600 font-medium">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
