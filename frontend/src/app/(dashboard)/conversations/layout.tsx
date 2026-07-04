'use client'

// Keep the whole /conversations segment on the edge runtime, matching the
// [id] page below (required for the Cloudflare Pages deployment).
export const runtime = 'edge'

import { usePathname } from 'next/navigation'
import { ConversationsProvider } from '@/components/conversations/conversations-provider'
import { ConversationsSidebar } from '@/components/conversations/conversations-sidebar'
import { cn } from '@/lib/utils'

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hasSelectedConversation = pathname !== '/conversations'

  return (
    <ConversationsProvider>
      <div className="flex h-[100dvh] lg:h-[calc(100dvh-2rem)] lg:rounded-card lg:border lg:border-border overflow-hidden bg-card">
        <div className={cn(
          'w-full lg:w-[360px] xl:w-[400px] shrink-0 border-r border-border flex flex-col',
          hasSelectedConversation ? 'hidden lg:flex' : 'flex'
        )}>
          <ConversationsSidebar />
        </div>
        <div className={cn(
          'flex-1 min-w-0 flex flex-col',
          hasSelectedConversation ? 'flex' : 'hidden lg:flex'
        )}>
          {children}
        </div>
      </div>
    </ConversationsProvider>
  )
}
