// Telegram Bot API via plain fetch (no SDK). https://core.telegram.org/bots/api#sendmessage

export type SendResult =
  | { ok: true; providerMsgId: string }
  | { ok: false; errorCode: string; /** user blocked the bot → stop sending (plan §7) */ blocked: boolean }

export interface TelegramMessage {
  chatId: string
  html: string
  button?: { text: string; url: string }
}

export interface TelegramSender {
  send(m: TelegramMessage): Promise<SendResult>
}

const TIMEOUT_MS = 10_000

export function createTelegramSender(botToken: string, fetchImpl: typeof fetch = fetch): TelegramSender {
  return {
    async send({ chatId, html, button }) {
      try {
        const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...(button && { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } }),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          result?: { message_id?: number }
          error_code?: number
          description?: string
        }
        if (res.ok && body.ok && body.result?.message_id !== undefined) {
          return { ok: true, providerMsgId: String(body.result.message_id) }
        }
        const code = body.error_code ?? res.status
        return { ok: false, errorCode: `TELEGRAM_${code}: ${body.description ?? 'unknown'}`.slice(0, 200), blocked: code === 403 }
      } catch (err) {
        return { ok: false, errorCode: `TELEGRAM_NETWORK: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200), blocked: false }
      }
    },
  }
}
