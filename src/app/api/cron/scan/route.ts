import { after } from 'next/server'
import { defaultTickDeps } from '@/lib/alerts/deps'
import { runScanTick } from '@/lib/alerts/tick'
import { env } from '@/lib/env'
import { verifyCronSecret } from '@/lib/utils/cron-auth'

// Called by cron-job.org every 30 minutes. It only waits ~30s for a response, so we answer 202 at once
// and run the tick in after(), which Vercel keeps alive up to maxDuration (plan §1).
export const maxDuration = 300

export async function POST(request: Request) {
  const config = env()
  if (!config.CRON_SECRET) {
    return Response.json({ error: 'CRON_SECRET chưa được cấu hình' }, { status: 503 })
  }
  if (!verifyCronSecret(request.headers.get('x-cron-secret'), config.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Dev/test only: `?wait=1` runs the tick inline and returns its summary.
  if (config.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('wait') === '1') {
    return Response.json(await runScanTick(defaultTickDeps()))
  }

  after(async () => {
    try {
      const summary = await runScanTick(defaultTickDeps())
      console.log('[cron/scan]', JSON.stringify(summary))
    } catch (err) {
      console.error('[cron/scan] tick failed', err)
    }
  })
  return Response.json({ accepted: true }, { status: 202 })
}
