import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { createTelegramSender } from '@/lib/notifications/channels/telegram'
import { getProvider } from '@/lib/providers/registry'
import type { TickDeps } from './tick'

/** Production wiring for a scan tick. Tests build TickDeps by hand with fakes. */
export function defaultTickDeps(): TickDeps {
  const config = env()
  return {
    db: db(),
    provider: getProvider(),
    telegram: config.TELEGRAM_BOT_TOKEN ? createTelegramSender(config.TELEGRAM_BOT_TOKEN) : null,
    fallbackChatId: config.TELEGRAM_CHAT_ID,
    now: () => new Date(),
  }
}
