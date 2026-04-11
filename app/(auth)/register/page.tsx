'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({
  full_name: z.string().min(3, 'Nome muito curto'),
  workspace_name: z.string().min(3, 'Nome da organização muito curto').optional(),
  invite_code: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
}).refine(
  (d) => d.invite_code?.trim() || d.workspace_name?.trim(),
  { message: 'Informe o nome da organização ou um código de convite', path: ['workspace_name'] }
)

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    const supabase = createClient()

    const inviteToken = data.invite_code?.trim() || undefined

    // Pré-validar o token antes de criar a conta (evita surpresas pós-cadastro)
    if (inviteToken) {
      const { data: tokenCheck } = await supabase.rpc('check_invite_token', {
        token_input: inviteToken,
      })
      if (!tokenCheck) {
        setError('Código de convite inválido ou expirado. Solicite um novo convite ao administrador.')
        return
      }
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          workspace_name: inviteToken ? undefined : data.workspace_name,
          invite_token: inviteToken,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    if (!authData.user) {
      setError('Erro ao criar conta. Tente novamente.')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-600 to-brand-800 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-9 h-9 text-brand-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.66 19 7.66 17.11 9 16c2.83 2.83 5.17 5 6 8h2c-.83-3-3.17-5.17-6-8 2-1 4-2 6-2V8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Plataforma ATER</h1>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Criar conta</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label="Seu nome completo"
              placeholder="João da Silva"
              autoComplete="name"
              error={errors.full_name?.message}
              {...register('full_name')}
            />

            <Input
              label="Nome da organização"
              placeholder="Cooperativa / Empresa / ATER"
              hint="Deixe vazio se for entrar em uma organização existente"
              error={errors.workspace_name?.message}
              {...register('workspace_name')}
            />

            <Input
              label="Código de convite (opcional)"
              placeholder="Cole aqui o código recebido"
              hint="Recebeu um convite? Cole o código da organização aqui"
              {...register('invite_code')}
            />

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
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />

            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
              Criar conta
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Já tem conta?{' '}
            <Link href="/login" className="text-brand-600 font-medium">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
