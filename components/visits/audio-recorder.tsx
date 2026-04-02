'use client'
import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface AudioRecorderProps {
  visitId: string
  workspaceId: string
  existingUrls: string[]
  disabled?: boolean
  onSaved: (url: string) => void
}

export function AudioRecorder({ visitId, workspaceId, existingUrls, disabled, onSaved }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await uploadAudio(blob, mimeType)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError('Sem acesso ao microfone')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function uploadAudio(blob: Blob, mimeType: string) {
    setUploading(true)
    try {
      const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
      const path = `${workspaceId}/visits/${visitId}/audio-${uuidv4()}.${ext}`
      const supabase = createClient()
      const { data, error: uploadError } = await supabase.storage.from('media').upload(path, blob, {
        contentType: mimeType,
      })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.path)
      onSaved(publicUrl)
    } catch {
      setError('Erro ao salvar áudio. Verifique sua conexão.')
    } finally {
      setUploading(false)
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {!recording ? (
          <Button
            variant="secondary"
            onClick={startRecording}
            disabled={disabled || uploading}
            loading={uploading}
          >
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 014 4v7a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v7a2 2 0 004 0V5a2 2 0 00-2-2zm6.364 5.636A7 7 0 015.636 8.636 7 7 0 015 12h2a5 5 0 0010 0h2a7 7 0 01-.636 3.364zM11 19.93V22h2v-2.07A8.001 8.001 0 0019.938 13H18a6 6 0 01-12 0H4.062A8.001 8.001 0 0011 19.93z" />
            </svg>
            {uploading ? 'Salvando...' : 'Gravar áudio'}
          </Button>
        ) : (
          <Button variant="danger" onClick={stopRecording}>
            <span className="w-2 h-2 bg-white rounded-sm mr-2 inline-block" />
            Parar · {formatTime(seconds)}
          </Button>
        )}
        {recording && (
          <span className="flex items-center gap-1.5 text-sm text-red-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Gravando
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {existingUrls.length > 0 && (
        <div className="flex flex-col gap-2">
          {existingUrls.map((url, i) => (
            <div key={url} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Áudio {i + 1}</span>
              <audio controls src={url} className="h-8 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
