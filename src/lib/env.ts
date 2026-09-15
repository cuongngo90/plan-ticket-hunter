import { z } from 'zod'

// Server-side environment, validated on first use (not at import) so `next build`
// works without secrets. Variables for later phases are optional until their feature lands.

const emailList = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )

const flag = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((v) => v === '1' || v === 'true')

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'DATABASE_URL phải là URL postgres://…' }),

  // Phase 2 — auth
  ALLOWED_EMAILS: emailList,
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Phase 2 — providers, cron, notifications
  TRAVELPAYOUTS_TOKEN: z.string().optional(),
  MOCK_PROVIDER: flag,
  CRON_SECRET: z.string().min(16).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Biến môi trường không hợp lệ:\n${issues}`)
  }
  return result.data
}

let cached: Env | undefined

export function env(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
