'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
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

export default function EditProducerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [state, setState] = useState('')
  const [city, setCity] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    db.producers.get(id).then((p) => {
      if (!p) { router.push('/producers'); return }
      reset({
        name:     p.name,
        phone:    p.phone    ?? '',
        email:    p.email    ?? '',
        cpf_cnpj: p.cpf_cnpj ?? '',
        sex:      p.sex      ?? '',
        locality: p.locality ?? '',
        status:   p.status   ?? 'active',
        notes:    p.notes    ?? '',
      })
      setState(p.state ?? '')
      setCity(p.city  ?? '')
    })
  }, [id, router, reset])

  async function onSubmit(data: FormData) {
    const now = new Date().toISOString()
    const updated = {
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
            label="CPF / CNPJ"
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
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
