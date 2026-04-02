'use client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
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

export default function NewProducerPage() {
  const router = useRouter()
  const { workspace } = useAuthStore()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!workspace) return

    const id = uuidv4()
    const now = new Date().toISOString()

    const producer = {
      id,
      workspace_id: workspace.id,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      notes: data.notes || null,
      created_at: now,
      updated_at: now,
    }

    await db.producers.add(producer)
    await enqueueSyncItem('producers', 'insert', id, producer)

    router.push(`/producers/${id}`)
  }

  return (
    <>
      <TopBar title="Novo Produtor" backHref="/producers" />
      <div className="px-4 py-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Nome completo"
            placeholder="Maria Souza"
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
            placeholder="Informações adicionais sobre o produtor..."
            {...register('notes')}
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            Salvar produtor
          </Button>
        </form>
      </div>
    </>
  )
}
