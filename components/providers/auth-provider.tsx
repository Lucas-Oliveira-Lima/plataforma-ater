'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth.store'
import { pullFromSupabase } from '@/lib/sync/sync-engine'
import type { Profile, Workspace } from '@/types'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setProfile, setWorkspace, clear } = useAuthStore()

  useEffect(() => {
    const supabase = createClient()

    async function loadUserData(userId: string) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, workspaces(*)')
        .eq('id', userId)
        .single()

      if (profile) {
        setProfile(profile as Profile)
        setWorkspace((profile as Profile & { workspaces: Workspace }).workspaces)

        // Pull latest data from Supabase into local IndexedDB
        await pullFromSupabase(profile.workspace_id)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadUserData(session.user.id)
      }
      if (event === 'SIGNED_OUT') {
        clear()
      }
    })

    return () => subscription.unsubscribe()
  }, [setProfile, setWorkspace, clear])

  return <>{children}</>
}
