import { create } from 'zustand'

interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  stuckCount: number
  lastSyncedAt: string | null
  setOnline: (v: boolean) => void
  setSyncing: (v: boolean) => void
  setPendingCount: (n: number) => void
  setStuckCount: (n: number) => void
  setLastSyncedAt: (t: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  stuckCount: 0,
  lastSyncedAt: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setStuckCount: (stuckCount) => set({ stuckCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}))
