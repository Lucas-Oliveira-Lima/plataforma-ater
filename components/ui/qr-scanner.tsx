'use client'
import { useRef, useState } from 'react'

interface QrScannerProps {
  onResult: (value: string) => void
  label?: string
}

// Tenta extrair o código CAR de uma string decodificada do QR.
// QR codes do SICAR costumam conter URLs como:
// https://car.gov.br/publico/imoveis/index?cod_imovel=SP-3548500-XXX...
function extractCarCode(raw: string): string {
  const text = raw.trim()
  try {
    const url = new URL(text)
    const cod = url.searchParams.get('cod_imovel')
    if (cod) return cod.trim()
  } catch {}

  // Padrão direto: UF-IBGE_CODE-HASH (ex: SP-3548500-DC5B3A5D...)
  const carPattern = /[A-Z]{2}-\d{7}-[A-Z0-9]{32}/
  const match = text.match(carPattern)
  if (match) return match[0]

  return text
}

export function QrScanner({ onResult, label = 'Escanear QR Code CAR' }: QrScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanning(true)
    setError(null)

    try {
      const imageData = await fileToImageData(file)
      const jsQR = (await import('jsqr')).default
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        onResult(extractCarCode(code.data))
      } else {
        setError('Nenhum QR Code encontrado na imagem. Tente novamente com melhor iluminação.')
      }
    } catch {
      setError('Erro ao processar a imagem.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => { setError(null); fileInputRef.current?.click() }}
        disabled={scanning}
        className="flex items-center gap-2 px-4 py-3 rounded-xl border border-brand-300 bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
        </svg>
        {scanning ? 'Lendo QR Code...' : label}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <p className="text-xs text-gray-400">Tire uma foto do QR Code no documento do CAR</p>
    </div>
  )
}

// Converte um File de imagem para ImageData (necessário para jsQR)
function fileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas não suportado')); return }
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')) }
    img.src = url
  })
}
