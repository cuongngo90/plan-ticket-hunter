import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { createTelegramSender } from '@/lib/notifications/channels/telegram'
import { getProvider } from '@/lib/providers/registry'
import type { TickDeps } from './tick'

/** Production wiring for a scan tick. Tests build TickDeps by hand with fakes. */
export function defaultTickDeps(): TickDeps {
  const e = env()
  return {
    db: db(),
    provider: getProvider(),
    telegram: e.TELEGRAM_BOT_TOKEN ? createTelegramSender(e.TELEGRAM_BOT_TOKEN) : null,
    fallbackChatId: e.TELEGRAM_CHAT_ID,
    now: () => new Date(),
  }
}
