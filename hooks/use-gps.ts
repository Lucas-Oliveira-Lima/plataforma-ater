'use client'
import { useState } from 'react'
import { getCurrentPosition, type GpsCoords } from '@/lib/utils/gps'

export function useGps() {
  const [coords, setCoords] = useState<GpsCoords | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function capture() {
    setLoading(true)
    setError(null)
    try {
      const pos = await getCurrentPosition()
      setCoords(pos)
      return pos
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao obter GPS'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { coords, loading, error, capture }
}
