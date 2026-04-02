'use client'
import Link from 'next/link'
import { SyncIndicator } from './sync-indicator'

interface TopBarProps {
  title: string
  backHref?: string
  action?: React.ReactNode
}

export function TopBar({ title, backHref, action }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3 px-4 py-3">
        {backHref && (
          <Link href={backHref} className="p-1 -ml-1 text-gray-500 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
        )}
        <h1 className="flex-1 text-lg font-semibold text-gray-900 truncate">{title}</h1>
        <SyncIndicator />
        {action}
      </div>
    </header>
  )
}
