'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { TopBar } from '@/components/layout/top-bar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function EditProducerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    db.producers.get(id).then((p) => {
      if (!p) { router.push('/producers'); return }
      reset({
        name: p.name,
        phone: p.phone ?? '',
        email: p.email ?? '',
        notes: p.notes ?? '',
      })
    })
  }, [id, router, reset])

  async function onSubmit(data: FormData) {
    const now = new Date().toISOString()
    const updated = {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      notes: data.notes || null,
      updated_at: now,
    }
    await db.producers.update(id, updated)
    await enqueueSyncItem('producers', 'update', id, { id, ...updated })
    router.push(`/producers/${id}`)
  }

  return (
    <>
      <TopBar title="Editar Produtor" backHref={`/producers/${id}`} />
      <div className="px-4 py-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Nome completo"
            required
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Telefone"
            type="tel"
            placeholder="(11) 99999-9999"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="E-mail"
            type="email"
            placeholder="produtor@email.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Textarea
            label="Observações"
            placeholder="Informações adicionais..."
            {...register('notes')}
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            Salvar alterações
          </Button>
        </form>
      </div>
    </>
  )
}
