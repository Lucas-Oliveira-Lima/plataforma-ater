'use client'
import { useSyncStore } from '@/stores/sync.store'
import { useSync } from '@/hooks/use-sync'

export function SyncIndicator() {
  const { isOnline, isSyncing, pendingCount, stuckCount } = useSyncStore()
  const { sync } = useSync()

  if (!isOnline) {
    return (
      <button
        onClick={() => sync()}
        className="flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        Offline{pendingCount > 0 ? ` — ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : ''}
      </button>
    )
  }

  if (isSyncing) {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Sincronizando...
      </span>
    )
  }

  if (stuckCount > 0) {
    return (
      <button
        onClick={() => sync(true)}
        title={`${stuckCount} item${stuckCount > 1 ? 's' : ''} travado${stuckCount > 1 ? 's' : ''}. Clique para forçar reenvio.`}
        className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        {stuckCount} travado{stuckCount > 1 ? 's' : ''} — Reenviar
      </button>
    )
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={() => sync()}
        className="flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium"
      >
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
      <span className="w-2 h-2 rounded-full bg-green-500" />
      Sincronizado
    </span>
  )
}
