'use client'
import { useRef, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface SignaturePadProps {
  existingUrl?: string | null
  onSaved: (url: string) => void
  onUpload: (blob: Blob) => Promise<string>
  disabled?: boolean
}

export function SignaturePad({ existingUrl, onSaved, onUpload, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!existingUrl)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const scaleX = canvasRef.current!.width / rect.width
    const scaleY = canvasRef.current!.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || saved) return
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasStroke(true)
  }

  function onPointerUp() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  async function save() {
    if (!hasStroke) return
    setSaving(true)
    try {
      const canvas = canvasRef.current!
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png')
      )
      const url = await onUpload(blob)
      onSaved(url)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (saved && existingUrl) {
    return (
      <div className="flex flex-col gap-2">
        <img src={existingUrl} alt="Assinatura do produtor" className="w-full border border-gray-200 rounded-xl bg-white max-h-40 object-contain" />
        <p className="text-xs text-green-600 text-center">Assinatura registrada</p>
        {!disabled && (
          <button onClick={() => setSaved(false)} className="text-xs text-gray-400 underline text-center">Refazer assinatura</button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasStroke && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400">Assine aqui</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={clear}
          className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
          disabled={!hasStroke}
        >
          Limpar
        </button>
        <Button className="flex-1" onClick={save} loading={saving} disabled={!hasStroke}>
          Salvar assinatura
        </Button>
      </div>
    </div>
  )
}
