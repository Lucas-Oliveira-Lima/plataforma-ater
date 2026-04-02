import { create } from 'zustand'
import type { Visit } from '@/types'

interface VisitState {
  activeVisit: Visit | null
  setActiveVisit: (visit: Visit | null) => void
}

export const useVisitStore = create<VisitState>((set) => ({
  activeVisit: null,
  setActiveVisit: (activeVisit) => set({ activeVisit }),
}))
