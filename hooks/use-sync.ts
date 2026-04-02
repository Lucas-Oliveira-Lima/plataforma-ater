'use client'
import { useEffect, useCallback } from 'react'
import { useOnline } from './use-online'
import { useSyncStore } from '@/stores/sync.store'
import { runSync, getPendingCount, getStuckCount } from '@/lib/sync/sync-engine'

export function useSync() {
  const isOnline = useOnline()
  const { setOnline, setSyncing, setPendingCount, setStuckCount, setLastSyncedAt } = useSyncStore()

  useEffect(() => {
    setOnline(isOnline)
  }, [isOnline, setOnline])

  const refreshCounts = useCallback(async () => {
    const [pending, stuck] = await Promise.all([getPendingCount(), getStuckCount()])
    setPendingCount(pending)
    setStuckCount(stuck)
  }, [setPendingCount, setStuckCount])

  const refreshPendingCount = refreshCounts

  const sync = useCallback(async (force = false) => {
    if (!isOnline) return
    setSyncing(true)
    try {
      await runSync((pending) => setPendingCount(pending), force)
      const [pending, stuck] = await Promise.all([getPendingCount(), getStuckCount()])
      setPendingCount(pending)
      setStuckCount(stuck)
      setLastSyncedAt(new Date().toISOString())
    } finally {
      setSyncing(false)
    }
  }, [isOnline, setSyncing, setPendingCount, setStuckCount, setLastSyncedAt])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      sync()
    }
  }, [isOnline, sync])

  // Refresh counts on mount
  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  return { sync, refreshPendingCount }
}
