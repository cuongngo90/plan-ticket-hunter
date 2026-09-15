// Find your Telegram chat id: send any message to your bot first, then
//   npm run telegram:chat-id
// Uses getUpdates, which only works while no webhook is set (true until slice 8).

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Thiếu TELEGRAM_BOT_TOKEN trong .env.local')

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  const body = (await res.json()) as {
    ok: boolean
    description?: string
    result?: { message?: { chat: { id: number; type: string; username?: string; first_name?: string } } }[]
  }
  if (!body.ok) throw new Error(`Telegram: ${body.description}`)

  const chats = new Map<number, string>()
  for (const u of body.result ?? []) {
    const c = u.message?.chat
    if (c) chats.set(c.id, `${c.type} · ${c.username ? '@' + c.username : (c.first_name ?? '')}`)
  }
  if (chats.size === 0) {
    console.log('Chưa thấy tin nhắn nào. Mở bot trên Telegram, bấm Start hoặc gửi 1 tin bất kỳ, rồi chạy lại.')
    return
  }
  for (const [id, who] of chats) console.log(`TELEGRAM_CHAT_ID=${id}   (${who})`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
