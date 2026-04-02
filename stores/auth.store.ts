import { create } from 'zustand'
import type { Profile, Workspace } from '@/types'

interface AuthState {
  profile: Profile | null
  workspace: Workspace | null
  setProfile: (profile: Profile | null) => void
  setWorkspace: (workspace: Workspace | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  workspace: null,
  setProfile: (profile) => set({ profile }),
  setWorkspace: (workspace) => set({ workspace }),
  clear: () => set({ profile: null, workspace: null }),
}))
