import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/layout/bottom-nav'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <AuthProvider>
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 pb-20">
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthProvider>
  )
}
