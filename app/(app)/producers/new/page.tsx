'use client'
import { useState } from 'react'
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
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { BrazilLocationSelect } from '@/components/ui/brazil-location-select'

const schema = z.object({
  name:     z.string().min(2, 'Nome obrigatório'),
  phone:    z.string().optional(),
  email:    z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpf_cnpj: z.string().optional(),
  sex:      z.enum(['M', 'F', 'O', 'N', '']).optional(),
  locality: z.string().optional(),
  status:   z.enum(['active', 'inactive']).default('active'),
  notes:    z.string().optional(),
})

type FormData = z.infer<typeof schema>

const SEX_OPTIONS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'O', label: 'Outro' },
  { value: 'N', label: 'Prefiro não informar' },
]

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
]

export default function NewProducerPage() {
  const router = useRouter()
  const { workspace } = useAuthStore()
  const [state, setState] = useState('')
  const [city, setCity] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active' },
  })

  async function onSubmit(data: FormData) {
    if (!workspace) return

    const id = uuidv4()
    const now = new Date().toISOString()

    const producer = {
      id,
      workspace_id: workspace.id,
      name:     data.name,
      phone:    data.phone    || null,
      email:    data.email    || null,
      cpf_cnpj: data.cpf_cnpj || null,
      sex:      data.sex || null,
      state:    state || null,
      city:     city  || null,
      locality: data.locality || null,
      status:   data.status,
      notes:    data.notes    || null,
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
            label="CPF / CNPJ"
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
            error={errors.cpf_cnpj?.message}
            {...register('cpf_cnpj')}
          />

          <Select
            label="Sexo"
            options={SEX_OPTIONS}
            placeholder="Selecione..."
            {...register('sex')}
          />

          <Input
            label="Telefone"
            type="tel"
            placeholder="(11) 99999-9999"
            {...register('phone')}
          />

          <Input
            label="E-mail"
            type="email"
            placeholder="produtor@email.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <BrazilLocationSelect
            stateValue={state}
            cityValue={city}
            onStateChange={setState}
            onCityChange={setCity}
          />

          <Input
            label="Localidade"
            placeholder="Comunidade, assentamento, zona rural..."
            {...register('locality')}
          />

          <Select
            label="Status"
            options={STATUS_OPTIONS}
            {...register('status')}
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
