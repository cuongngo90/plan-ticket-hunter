import { env } from '@/lib/env'
import { MockProvider } from './mock'
import type { FlightProvider } from './types'

let cached: FlightProvider | undefined

/** The provider the app uses. Travelpayouts is added in Phase 2 slice 3; until then only the mock exists. */
export function getProvider(): FlightProvider {
  if (cached) return cached
  const config = env()
  if (config.MOCK_PROVIDER) {
    cached = new MockProvider({ forceDealRoutes: config.MOCK_FORCE_DEAL })
    return cached
  }
  throw new Error('Chưa có provider thật (TravelpayoutsProvider — Phase 2 slice 3). Đặt MOCK_PROVIDER=1 để dùng MockProvider.')
}
