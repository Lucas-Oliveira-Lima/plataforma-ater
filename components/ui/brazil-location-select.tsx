'use client'
import { useEffect, useState } from 'react'
import { BRAZIL_STATES, fetchCities, type IBGECity } from '@/lib/utils/ibge'
import { Select } from './select'

interface BrazilLocationSelectProps {
  stateValue: string
  cityValue: string
  onStateChange: (uf: string) => void
  onCityChange: (city: string) => void
  stateError?: string
  cityError?: string
  disabled?: boolean
  required?: boolean
}

export function BrazilLocationSelect({
  stateValue,
  cityValue,
  onStateChange,
  onCityChange,
  stateError,
  cityError,
  disabled,
  required,
}: BrazilLocationSelectProps) {
  const [cities, setCities] = useState<IBGECity[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [cityFetchError, setCityFetchError] = useState(false)

  useEffect(() => {
    if (!stateValue) {
      setCities([])
      setCityFetchError(false)
      return
    }
    setLoadingCities(true)
    setCityFetchError(false)
    fetchCities(stateValue)
      .then((data) => {
        setCities(data)
        // Se a cidade atual não está na lista do novo estado, limpa
        if (cityValue && !data.some((c) => c.nome === cityValue)) {
          onCityChange('')
        }
      })
      .catch(() => setCityFetchError(true))
      .finally(() => setLoadingCities(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateValue])

  const stateOptions = BRAZIL_STATES.map((s) => ({
    value: s.sigla,
    label: `${s.sigla} — ${s.nome}`,
  }))

  const cityOptions = cities.map((c) => ({ value: c.nome, label: c.nome }))

  return (
    <>
      <Select
        label="Estado"
        value={stateValue}
        options={stateOptions}
        placeholder="Selecione o estado..."
        disabled={disabled}
        required={required}
        error={stateError}
        onChange={(e) => {
          onStateChange(e.target.value)
          onCityChange('')
        }}
      />

      {cityFetchError ? (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Município{required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="text"
            placeholder="Digite o município manualmente"
            value={cityValue}
            disabled={disabled}
            onChange={(e) => onCityChange(e.target.value)}
            className="w-full rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-orange-600">Sem conexão — digite o município manualmente</p>
          {cityError && <p className="text-sm text-red-600">{cityError}</p>}
        </div>
      ) : (
        <Select
          label="Município"
          value={cityValue}
          options={cityOptions}
          placeholder={
            !stateValue
              ? 'Selecione o estado primeiro'
              : loadingCities
                ? 'Carregando municípios...'
                : 'Selecione o município...'
          }
          disabled={disabled || !stateValue || loadingCities}
          required={required}
          error={cityError}
          onChange={(e) => onCityChange(e.target.value)}
        />
      )}
    </>
  )
}
