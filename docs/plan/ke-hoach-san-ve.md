# Kế hoạch: "Săn Vé" — App săn vé máy bay giá rẻ (Web + PWA)

> **Bản sửa 1 (15/09/2026):** Amadeus Self-Service đã đóng cửa (17/07/2026) → chọn lại provider qua spike; đơn vị quét đổi thành **tuyến × tháng bay**;
> phạm vi thu gọn cho quy mô **cá nhân + vài người quen**; lease nguyên tử thay `SELECT FOR UPDATE`; cập nhật theo Next.js 16.
>
> **Bản sửa 2 (16/09/2026):** bỏ email/Resend (không mua domain) → đăng nhập **Google OAuth**, thông báo **Web Push + Telegram Bot**; bỏ Upstash Redis
> (cache trong Postgres); **spike provider làm đầu tiên**; Search = lịch giá + deeplink nếu provider là giá cache. Sửa 4 lỗi logic: prune 60 ngày
> xung đột baseline 90 ngày · giá cache bị ghi lặp thành mẫu giả · gate Improvement chặn vĩnh viễn · alert dời giờ không có ai gửi.
>
> **Bản sửa 3 (16/09/2026):** bỏ Duffel (dành cho doanh nghiệp bán vé, không hợp app cá nhân). **Spike Phase 0 đã chạy — Travelpayouts đạt**
> → chốt làm provider duy nhất: `month-matrix` cho độ phủ + `found_at`, `prices_for_dates` cho tên hãng + deeplink (xem mục 4).

## Context

`F:\my-training\gen-ai\plan-ticket-hunter` hiện chưa có code (chỉ có `docs/`, `.agents/`, `skills-lock.json`; chưa phải git repo).
Mục tiêu: ứng dụng web giúp **tôi và vài người quen theo dõi và săn vé máy bay giá rẻ, chủ yếu tuyến nội địa VN**. User tạo "watch" cho một
tuyến bay + khoảng ngày + giá mục tiêu, hệ thống quét giá định kỳ, chấm điểm deal và bắn thông báo khi có vé rẻ.
Chạy trên trình duyệt và **cài lên điện thoại qua PWA**, không cần App Store / Play Store.

### Quyết định đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| Quy mô | Cá nhân + vài người quen: ≤ 10 user, ≤ 50 watch, **chi phí 0đ** (không mua domain), **phi thương mại** |
| Stack | Next.js 16 App Router (TypeScript) full-stack + PostgreSQL (Neon), deploy Vercel Hobby trên domain `*.vercel.app` |
| Mobile | PWA installable qua Serwist |
| Nguồn dữ liệu | **Travelpayouts Data API** (miễn phí, giá cache) sau interface `FlightProvider` — đã kiểm chứng bằng spike Phase 0; dev bằng `MockProvider` |
| Đơn vị quét | `scan_task` = **tuyến × tháng bay** (1 người lớn, economy). Watch chỉ là bộ lọc trên snapshot |
| Search | **Lịch giá rẻ nhất theo ngày + deeplink** sang Aviasales để xem giá thật (không có search realtime) |
| Hẹn giờ | cron-job.org gọi `/api/cron/scan` mỗi 30 phút |
| Thông báo | **Web Push + Telegram Bot**. Không email, không Zalo |
| Auth | **Google OAuth** (Auth.js) + allowlist email |
| Hạ tầng phụ | Không Redis — cache, bộ đếm quota đều nằm trong Postgres |
| Phạm vi MVP | Search + Price Alert. **Không** booking/thanh toán, không affiliate |

### Ràng buộc định hình kiến trúc

1. **Không còn API giá vé miễn phí "chuẩn".** Amadeus Self-Service bị khai tử 17/07/2026 (API key đã vô hiệu), Kiwi Tequila chỉ nhận đối tác được mời.
   Duffel (realtime) bị loại vì dành cho doanh nghiệp bán vé và tính phí khi chỉ search. Còn lại **Travelpayouts Data API**, đã kiểm chứng
   bằng spike Phase 0 (16/09/2026, 5 tuyến × 2 tháng):
   - ✅ Độ phủ ngày: `month-matrix` 90–97% trên các tuyến trục; `prices_for_dates` 52–100%. Trả VND trực tiếp. Latency ~750ms.
   - ✅ Hãng VN: thấy **VietJet** trên 5/5 tuyến, cùng Vietnam Airlines, Vietravel, Pacific Airlines, 9G. **Không thấy Bamboo (QH)**.
   - ✅ `month-matrix` có `found_at`; tuổi giá trung vị 17–35 giờ. `prices_for_dates` có `airline` và `link` (deeplink Aviasales).
     Hai endpoint trả **cùng giá cho cùng ngày** → cùng một nguồn cache, gộp được.
   - ⚠️ Giá là **cache từ lượt tìm của người dùng Aviasales**: không realtime, không theo số khách. Tuyến ít người bay không có dữ liệu
     (SGN–VCA: 0 ngày — tuyến này hầu như không có chuyến thẳng, nên không phải lỗi độ phủ).
   - ⏳ Còn phải làm tay: đọc ToS (Data API không gắn link affiliate có được không), đối chiếu 5–10 giá với web hãng, rate limit.
   Chưa có provider dự phòng — nếu Travelpayouts đóng API, app vẫn chạy với `MockProvider` và dữ liệu lịch sử đã lưu.
2. **Provider có thể biến mất bất cứ lúc nào** (bài học Amadeus) → mọi code ngoài `lib/providers/<tên>/` chỉ được phụ thuộc domain types,
   và `MockProvider` phải đủ tốt để app chạy được khi không có provider thật.
3. **Không có domain riêng** → không gửi email được (Resend và các dịch vụ tương tự bắt buộc verify domain mới gửi cho người khác).
   Kênh bắt buộc thay email là **Telegram**: miễn phí, chạy tốt trên iOS mà không cần cài PWA.

Hệ quả phụ: **Vercel Hobby chỉ cho cron 1 lần/ngày** → dùng cron-job.org (miễn phí, chính xác tới phút, không tự tắt như GitHub Actions schedule).
cron-job.org chỉ chờ phản hồi trong thời gian ngắn (khoảng 30s — xác nhận khi cấu hình) → `/api/cron/scan` **trả 202 ngay và chạy tiếp trong `after()`**.
Hobby chỉ hợp lệ khi **phi thương mại** — nếu sau này có doanh thu phải lên Pro.

---

## 1. Kiến trúc tổng thể

```
FOREGROUND
PWA client (RSC + client islands, Service Worker, PushManager)
   │ HTTPS
   ▼
Next.js route handlers (Auth.js session · Zod validate) — proxy.ts chặn route chưa đăng nhập
   ▼
Provider layer:  Cache (Postgres) → QuotaCounter → Retry → <ProviderChính> | MockProvider
   ▼
Travelpayouts Data API (month-matrix + prices_for_dates)

BACKGROUND
cron-job.org (mỗi 30 phút, header x-cron-secret)
   │ POST /api/cron/scan  → trả 202 ngay, phần dưới chạy trong after() (maxDuration 300s)
   ▼
Scheduler ─ tính tick budget, lease các scan_tasks đến hạn (UPDATE … RETURNING, nguyên tử)
   ▼
Scanner ─ gọi provider (tuần tự) → ghi price_snapshots (bỏ qua quan sát trùng) → cập nhật next_scan_at, nhả lease
   ▼
Deal Detector ─ lọc snapshot theo từng watch → chấm điểm → 5 gate chống spam → alert_events
   ▼
Dispatcher ─ gửi alert_events mới + mọi alert_events có scheduled_for ≤ now() chưa gửi
             → Web Push → Telegram fallback → log vào notifications

Telegram → POST /api/telegram/webhook (header secret_token) — liên kết chat_id khi user bấm /start.
Cron thứ 2: /api/cron/rollup (1 lần/ngày 02:00 ICT) — tính route_stats, archive watch hết hạn, prune snapshot > 120 ngày,
            dọn cache hết hạn, xếp digest với scheduled_for = 07:00.
```

Với ≤ 50 task, tick 30 phút và gọi tuần tự, một tick mất < 60s — dư xa timeout 300s. **Không cần queue.** Chỉ cân nhắc QStash
khi p95 thời gian xử lý tick > 150s.

---

## 2. Cấu trúc thư mục

```
plan-ticket-hunter/
├─ next.config.ts            # withSerwist
├─ drizzle.config.ts · vitest.config.ts · playwright.config.ts · .env.example
├─ .github/workflows/ci.yml
├─ public/icons/{icon-192, icon-512, icon-maskable-512, apple-touch-icon-180, badge-72}.png
├─ public/screenshots/{mobile-1, desktop-1}.png
├─ drizzle/                  # SQL migrations
├─ spike/                    # Phase 0 — script Node độc lập (đã chạy, xem spike/README.md)
├─ scripts/{gen-vapid, seed-airports, seed-dev, simulate-cron, capture-fixtures, set-telegram-webhook}.ts
└─ src/
   ├─ proxy.ts · sw.ts · instrumentation.ts          # Next 16: proxy.ts thay middleware.ts
   ├─ app/
   │  ├─ layout.tsx · manifest.ts · page.tsx · ~offline/page.tsx
   │  ├─ (auth)/sign-in/page.tsx
   │  ├─ (app)/{search, watches, watches/new, watches/[id], alerts, settings}/page.tsx
   │  └─ api/
   │     ├─ auth/[...nextauth] · health · airports · search
   │     ├─ watches · watches/[id] · watches/[id]/history
   │     ├─ push/{subscribe, unsubscribe, test}
   │     ├─ telegram/{link, webhook}
   │     └─ cron/{scan, rollup}
   ├─ components/{ui, search, watch, pwa, layout}/
   └─ lib/
      ├─ env.ts · auth.ts
      ├─ db/{index.ts, schema.ts, queries/*}
      ├─ providers/{types, registry, errors, cache, quota, retry}.ts
      │  ├─ travelpayouts/{client, index, mapper}.ts
      │  └─ mock/{index, generator}.ts + fixtures/
      ├─ alerts/{scheduler, cadence, scanner, deal-detector, gates, episode, stats, types}.ts
      ├─ notifications/{types, dispatcher}.ts + channels/{web-push, telegram}.ts + templates.ts
      └─ utils/{money, date, logger, cron-auth, hash}.ts
```

---

## 3. Data model — Drizzle ORM

**Chọn Drizzle thay vì Prisma** vì alert engine cần `percentile_cont`, `FOR UPDATE SKIP LOCKED`, partial index,
BRIN, `ON CONFLICT` — Drizzle viết thẳng SQL, còn Prisma phải `$queryRaw` và mất type-safety. Drizzle cũng không
có engine binary nên cold start serverless nhanh hơn.

**Driver: `postgres` (postgres-js) qua TCP cho mọi môi trường** (Docker local, CI, Neon pooled connection, `prepare: false`) — thay cho Neon HTTP driver
ở các bản trước. Một driver duy nhất nghĩa là test integration chạy đúng code production, và có transaction thật. Lease vẫn viết một câu lệnh
để an toàn với mọi driver.

**Tiền tệ:** VND không có phần thập phân (exponent 0). Travelpayouts trả VND trực tiếp khi gọi với `currency=vnd` (đã kiểm trong spike),
nên chỉ cần cột `amount_vnd bigint` — **mọi phép so sánh/percentile dùng cột này**. Không cần bảng tỷ giá.

| Bảng | Vai trò | Index quan trọng |
|---|---|---|
| `users` (+ bảng Auth.js) | Hồ sơ + preferences: quiet hours (22–7), `max_alerts_per_day`=5, `max_active_watches`=5, `telegram_chat_id`, `telegram_blocked_at` | unique `lower(email)` |
| `telegram_link_tokens` | Token 1 lần, hết hạn 15 phút, dùng trong link `t.me/<bot>?start=<token>` | PK `token` |
| `airports` | IATA, tên, `city_vi` để tìm tiếng Việt, timezone, `search_text` (bỏ dấu sẵn bằng `normalizeSearch` ở app — `unaccent()` không IMMUTABLE nên không index được) | GIN trigram (`pg_trgm`) trên `search_text` |
| **`scan_tasks`** | **Đơn vị quét**, key tự nhiên `(origin, dest, depart_month)`. Có `next_scan_at`, `leased_until`, `lease_id`, `consecutive_failures`, `status` (`active`/`idle`/`done`) | unique `(origin, dest, depart_month)`; ⭐ partial `(next_scan_at) WHERE status='active'` |
| `watches` | Ý định của user: `origin`, `dest`, `date_from`, `date_to`, `pax`, `target_amount_vnd`, `drop_threshold_pct`=0.15, `min_deal_score`=50, `cooldown_hours`=12, `episode_no`, `last_notified_at/amount`, `paused_reason`, `expires_at` | partial `(origin, dest) WHERE active`; partial `(user_id, created_at)` |
| `watch_scan_tasks` | Nối N-N: watch có dải ngày vắt qua 2 tháng thì gắn 2 task. Gắn watch vào task `idle` → `status='active'`, `next_scan_at=now()`. Task không còn watch → `idle` | PK `(watch_id, scan_task_id)` |
| `price_snapshots` | **Một row cho mỗi quan sát thật**: giá rẻ nhất của `(scan_task, depart_date)`: `amount_vnd`, `carrier`, `stops`, `observed_at`, `source_found_at`, `observation_key` | ⭐ unique `(scan_task_id, depart_date, observation_key)` + `ON CONFLICT DO NOTHING`; `(origin, dest, depart_date, observed_at DESC)`; BRIN `observed_at` |
| `route_stats` | Baseline tính trước theo tuyến + tháng bay + cửa sổ 30/90 ngày: p10, p25, median, min, `sample_count` | PK `(origin, dest, depart_month, window_days)` |
| `alert_events` | Deal đã phát hiện, tách riêng khỏi việc gửi: score, danh sách rule khớp, `scheduled_for`, `dispatched_at` | ⭐ unique `dedupe_key`; partial `(scheduled_for) WHERE dispatched_at IS NULL` |
| `notifications` | Log gửi: mỗi kênh 1 row, gồm status, `provider_msg_id`, `error_code` | partial `(user_id, created_at DESC) WHERE sent` để đếm daily cap |
| `push_subscriptions` | endpoint, p256dh, auth, platform, `is_standalone`, `failure_count`, `revoked_at` | unique `endpoint` |
| `provider_cache` | Thay Redis: `key`, `payload jsonb`, `fresh_until`, `stale_until` | PK `key`; index `stale_until` để rollup dọn |
| `provider_quota_usage` | Bộ đếm lượt gọi theo tháng (audit, phát hiện gọi quá nhiều), tăng bằng `INSERT … ON CONFLICT DO UPDATE SET count = count + 1` | PK `(provider, endpoint, period)` |

**`observation_key` — chống mẫu giả:** key = `source_found_at` (trường `found_at` của `month-matrix`, thời điểm Aviasales ghi nhận giá) → quét lại
trả đúng giá cũ thì **không sinh row mới**, `sample_count` chỉ đếm quan sát thật, và retry cũng không ghi trùng.
(Unique theo `observed_at` như bản đầu không chặn được, vì mỗi lần ghi có `now()` khác nhau.)

**Giá nhiều khách:** snapshot luôn là giá 1 người lớn. Watch có `pax > 1` thì alert ghi "≈ N × giá, ước tính cho N khách";
giá thật xem qua deeplink Aviasales.

**Lease nguyên tử** — query nóng nhất, chạy mỗi tick. Viết thành **một câu lệnh duy nhất** để không phụ thuộc transaction của driver
(với driver HTTP, `SELECT … FOR UPDATE` đứng một mình sẽ nhả lock ngay khi trả kết quả):
```sql
UPDATE scan_tasks
SET leased_until = now() + interval '5 minutes', lease_id = gen_random_uuid()
WHERE id IN (
  SELECT id FROM scan_tasks
  WHERE status = 'active' AND next_scan_at <= now()
    AND (leased_until IS NULL OR leased_until < now())
  ORDER BY next_scan_at ASC
  LIMIT $tickBudget
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```
Scanner xong task nào thì set `next_scan_at` mới + `leased_until = NULL` cho task đó (kèm điều kiện `lease_id` khớp, để worker cũ đã hết lease không ghi đè).
Worker chết giữa chừng thì lease tự hết hạn sau 5 phút. Sắp theo `next_scan_at` (task quá hạn lâu nhất đi trước) nên không task nào bị bỏ đói.

**Dung lượng:** trần trên ≤ 50 task × 2 lần quét/ngày × ~30 ngày bay ≈ 3.000 rows/ngày ≈ 90k rows/tháng (thực tế ít hơn nhiều nhờ `observation_key`).
**Giữ 120 ngày** (phải > cửa sổ baseline 90 ngày) → tối đa ~360k rows, ~100–120MB kể cả index, vẫn dưới Neon free 0.5GB.

---

## 4. Provider layer

**Domain types chuẩn hoá** (`lib/providers/types.ts`), không phụ thuộc format của provider nào: `Money`, `Segment`,
`Itinerary`, `FlightOffer` (có `providerId`, `fetchedAt`, `sourceFoundAt`, `stale`, `deeplink?`), `CheapestDate`,
`ProviderCapabilities` (có `supportsLcc`, `realtime`, `monthlyQuota | null`).

```ts
interface FlightProvider {
  readonly id: ProviderId
  readonly capabilities: ProviderCapabilities
  getCheapestByMonth(p: CheapestByMonthParams, opt?: CallOptions): Promise<ProviderResult<CheapestDate[]>> // lệnh gọi chính của scanner và Search
  buildDeeplink(p: DeeplinkParams): string                                                                 // tuyến + ngày + số khách
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>
}
// CallOptions: { allowStale?, signal? }
```

**`TravelpayoutsProvider.getCheapestByMonth` = 2 lượt gọi, gộp theo ngày** (schema thật lấy từ spike, xem `spike/results/`):

| Endpoint | Tham số | Lấy gì |
|---|---|---|
| `GET /v2/prices/month-matrix` | `origin, destination, month=YYYY-MM-01, currency=vnd, one_way=true, show_to_affiliates=true` | Độ phủ ngày (90–97%): `depart_date`, `value`, `found_at`, `number_of_changes` |
| `GET /aviasales/v3/prices_for_dates` | `origin, destination, departure_at=YYYY-MM, currency=vnd, one_way=true, sorting=price, limit=1000` | `airline`, `flight_number`, `departure_at`, `transfers`, `link` (deeplink) |

Với mỗi ngày: giá và `found_at` lấy từ `month-matrix`; `carrier` và deeplink lấy từ vé rẻ nhất của `prices_for_dates` cùng ngày,
**chỉ khi cùng giá** (spike cho thấy hai endpoint trả cùng giá cho cùng ngày). Ngày chỉ có ở `prices_for_dates` → dùng giá đó,
`found_at` suy từ tham số `search_date` trong `link`, nếu không có thì bỏ qua ngày đó (không có `observation_key`).
Không có deeplink riêng cho ngày thì `buildDeeplink` dựng link tìm kiếm Aviasales theo tuyến + ngày + số khách.
Endpoint `/v1/prices/calendar` không dùng (độ phủ chỉ 13–58%).

**Chuỗi decorator** (`registry.ts`): `withCache(withQuotaCounter(withRetry(provider)))`.
Cache nằm ngoài cùng vì cache hit không tốn lượt gọi. Retry nằm trong cùng, và mỗi lần gọi mạng đều được đếm.

- **Cache — bảng `provider_cache` trong Postgres:** `getCheapestByMonth` 6h (giá cache phía Aviasales đã cũ 17–35h, cache dài hơn không mất gì) · airports 30 ngày.
  Stale-while-revalidate qua `after()`. Khi provider lỗi thì trả stale, UI hiện "Giá cập nhật lúc HH:mm". Rollup xoá row quá `stale_until`.
- **Quota counter:** đếm mọi lượt gọi vào `provider_quota_usage`. Nếu `capabilities.monthlyQuota` khác null:
  `tickBudget = min(20, (quota × 0.85 − used) / ngày còn lại / số tick mỗi ngày)`. Hết quota thì ném `QuotaExhaustedError` và chỉ trả cache.
  Travelpayouts chưa công bố quota rõ ràng trong spike → để `monthlyQuota = null`, chỉ đếm; chốt lại khi đọc tài liệu rate limit.
- **Retry:** tối đa 3 lần cho 408/425/429/5xx, backoff `min(8s, 500ms·2ⁿ) + jitter`, tôn trọng `Retry-After`. Scanner gọi tuần tự nên không cần rate limiter riêng.
- **Mapper** là hàm thuần `(raw) => FlightOffer | CheapestDate`. Tiền đọc từ số nguyên/string (không dùng `parseFloat` rồi làm tròn),
  `departure_at` đã kèm offset (`2026-10-15T06:00:00+07:00`) nên 10 ký tự đầu là ngày bay địa phương. Phải map `source_found_at` — thiếu trường này thì không dùng được `observation_key`.
- **Không đốt lượt gọi khi dev:** (1) `MockProvider` (`MOCK_PROVIDER=1`) sinh giá deterministic theo mùa (Tết ×2.2, hè ×1.4),
  độ gấp (sát ngày bay ×1.8) và 3% cơ hội flash sale; `MOCK_FORCE_DEAL=SGN-HAN` để ép ra deal khi test. Mock có chế độ `cached` (trả lại cùng
  `source_found_at` vài lần liền) để test `observation_key`. (2) `capture-fixtures.ts` gọi thật một lần rồi lưu JSON. (3) MSW trong integration test.
  (4) Provider thật tự throw khi `NODE_ENV=test`.

**Ngoài phạm vi MVP:** circuit breaker, rate limiter phân tán, `confirmPrice`, `getInspiration` ("3 triệu bay được đâu?").

---

## 5. Alert engine (lõi "săn vé")

**Cadence** (`cadence.ts`) theo số ngày từ hôm nay tới **ngày bay gần nhất còn trong tương lai, nằm trong dải ngày của ít nhất một watch gắn với task**:
≤3 ngày → 3h · ≤14 → 4h · ≤30 → 8h · ≤60 → 12h · ≤120 → 24h · còn lại → 48h.
Mỗi lần lỗi liên tiếp thì backoff 2ⁿ (tối đa 48h). Thêm jitter ±10% để các task không cùng đến hạn một lúc.
Không còn ngày nào trong tương lai → `status='done'`.

**Luồng cho mỗi task sau khi quét:** lấy mọi watch active gắn với task → lọc snapshot theo `date_from..date_to` của watch → lấy giá rẻ nhất
→ chấm điểm **so với baseline của tháng chứa ngày bay đó** (watch vắt qua 2 tháng thì mỗi ngày dùng baseline tháng của nó).

**Chấm điểm deal** (`deal-detector.ts`, hàm thuần, thang 0–100, mặc định từ 50 điểm là deal):

| Rule | Điều kiện | Điểm |
|---|---|---|
| ABSOLUTE | giá ≤ target của user | 50–80 (riêng rule này đã đủ để báo) |
| RELATIVE_MEDIAN | giảm ≥ 15% so với median 30 ngày | tối đa 35 |
| PERCENTILE | ≤ p10 90 ngày / ≤ p25 | 30 / 14 |
| ALL_TIME_LOW | < min 90 ngày | 20 |

Các rule tương đối **chỉ bật khi `sample_count ≥ 8` quan sát thật** (đã loại trùng bằng `observation_key`). Nếu không, tuyến mới có 2 snapshot sẽ biến
mọi giá thành "all time low". Tuyến mới cần ít nhất 4–16 ngày mới đủ mẫu (lâu hơn nếu giá cache ít đổi) → UI watch hiện "Đang thu thập dữ liệu giá (x/8)".
"Giảm 15%" một mình không đủ điểm để báo; phải giảm sâu hoặc đồng thời lọt top 10% rẻ nhất.
Giá cache quá cũ (`source_found_at` > 72h trước — spike đo tuổi trung vị 17–35h) thì trừ 15 điểm và ghi rõ tuổi giá trong alert.

**Đợt deal (`episode.ts`)** — để một watch có thể được báo lại khi giá lên rồi xuống lại:
- Mỗi watch có `episode_no`. Đợt mới bắt đầu (tăng `episode_no`, xoá `last_notified_*`) khi **giá rẻ nhất hiện tại ≥ `last_notified_amount` × 1,10**
  hoặc **đã quá 7 ngày kể từ `last_notified_at`**.
- Gate Improvement và dedupe key chỉ so sánh trong cùng một đợt.

**5 gate chống spam, chạy lần lượt** (`gates.ts`):
1. **Cooldown:** 12h kể từ lần báo trước (6h nếu còn < 14 ngày là bay).
2. **Improvement:** trong cùng đợt, giá mới phải rẻ hơn lần báo trước ≥ 3%.
3. **Daily cap:** 5 alert/user/ngày; vượt thì gộp vào digest, rollup xếp gửi lúc 07:00.
4. **Quiet hours:** trong khung 22–7h thì đặt `scheduled_for` = 07:00, trừ khi score ≥ 90 và còn ≤ 3 ngày là bay.
   Dispatcher ở **mỗi tick** gửi các `alert_events` có `scheduled_for ≤ now()` và `dispatched_at IS NULL`.
5. **Dedupe key:** `sha256(watchId|episodeNo|departDate|carrier|bucket(amount, 2%))` + `ON CONFLICT DO NOTHING`, chống trùng khi 2 tick chồng nhau hoặc retry.

**Sức chứa:** 10 user × ≤ 5 watch = ≤ 50 watch. Vì task là tuyến × tháng, người quen hay bay cùng vài tuyến (SGN–HAN, SGN–DAD, HAN–PQC…),
thực tế ước ~15–30 task → ~60–120 lượt gọi/ngày (cadence trung bình 12h, 2 endpoint mỗi lần quét) — Travelpayouts miễn phí, cần xác nhận rate limit.
`simulate-cron.ts` dùng để tinh chỉnh các tham số này.

---

## 6. PWA

- **`app/manifest.ts`:** `id: '/'`, `display: 'standalone'` (**bắt buộc để iOS nhận push**), `start_url: '/watches?source=pwa'`,
  `lang: 'vi-VN'`, icon 192/512 + maskable 512, `screenshots` narrow/wide (để Android hiện install UI đầy đủ),
  3 shortcuts (Tìm chuyến bay / Deal của tôi / Tạo cảnh báo). Trong `layout.tsx` thêm `apple-touch-icon` 180×180 và `apple-mobile-web-app-title`.
- **Build với Next 16:** Turbopack là mặc định cho cả `next dev` lẫn `next build`, còn `@serwist/next` cần webpack →
  dùng `next build --webpack` / `next dev --webpack`, hoặc chuyển sang `@serwist/turbopack` (kiểm tra độ ổn định lúc bắt đầu slice 9).
- **Service worker `src/sw.ts` (Serwist):** precache app shell · `/api/auth`, `/api/push`, `/api/telegram` → NetworkOnly ·
  `/api/search`, `/api/watches` → NetworkFirst (timeout 8s, 15 phút) · `/api/airports` → StaleWhileRevalidate 30 ngày ·
  navigation → NetworkFirst, offline thì fallback `/~offline` · ảnh → CacheFirst.
  Xử lý các event `push` (tag = watchId để notification mới thay cái cũ), `notificationclick` (focus hoặc mở cửa sổ), và `pushsubscriptionchange` (tự đăng ký lại).
- **Web Push:** `npx web-push generate-vapid-keys` (**phải backup key, đổi key là mất toàn bộ subscription**).
  Chỉ subscribe khi user bấm nút → `POST /api/push/subscribe` upsert theo endpoint. Server gặp **404/410 thì set `revoked_at` ngay**,
  413 nghĩa là payload > 4KB, 403 là VAPID bị cấu hình sai. Rollup định kỳ dọn các subscription có `failure_count ≥ 5`.
- **iOS caveat:** cần iOS 16.4+, **bắt buộc Add to Home Screen từ Safari**, không có `beforeinstallprompt`, không hỗ trợ notification actions.
  Component `IosInstallSheet` xử lý theo từng trạng thái: đang ở Safari chưa cài → hướng dẫn Share → Thêm vào MH chính ·
  đang trong webview Zalo/Facebook/Chrome iOS → hướng dẫn "Mở trong Safari" · iOS < 16.4 hoặc không có `PushManager` → hướng dẫn liên kết Telegram.
- **Install prompt (Android/Desktop):** bắt `beforeinstallprompt` bằng inline script trong `layout.tsx`, vì event có thể bắn trước khi React hydrate.
  Event chỉ dùng được một lần. Nếu user dismiss thì 14 ngày sau mới hỏi lại. **Hiện nút cài sau khi user tạo watch đầu tiên.**
- **Nguyên tắc:** **không cho tạo watch khi user chưa có ít nhất một kênh hoạt động** (push còn hiệu lực hoặc Telegram đã liên kết).
  Nếu mọi kênh cùng chết (push bị revoke + bot bị chặn) thì tạm dừng watch (`paused_reason='NO_CHANNEL'`) và hiện banner khi user mở app.

---

## 7. Notification layer

```ts
interface NotificationChannel {
  readonly kind: 'web_push' | 'telegram'
  isAvailableFor(userId: string): Promise<boolean>
  send(p: NotificationPayload): Promise<DeliveryResult>   // không throw
}
```

- **WebPush** (`web-push`): gửi song song tới mọi subscription còn hiệu lực; chỉ cần 1 endpoint thành công là tính "sent".
- **Telegram Bot** (Bot API, gọi `fetch` trực tiếp, không cần SDK): miễn phí, giới hạn ~30 tin/giây — dư xa nhu cầu.
  - **Liên kết:** Settings → "Kết nối Telegram" → server tạo `telegram_link_tokens` → mở `t.me/<bot>?start=<token>` → user bấm Start →
    Telegram gọi `/api/telegram/webhook` (kiểm header `X-Telegram-Bot-Api-Secret-Token`) → lưu `telegram_chat_id`, trả lời "Đã kết nối".
  - Gửi `sendMessage` với `parse_mode: 'HTML'` + inline button mở deeplink / trang watch. Gặp 403 (user chặn bot) → set `telegram_blocked_at`.
  - Đăng ký webhook bằng `scripts/set-telegram-webhook.ts` sau mỗi lần đổi URL deploy.
- **Dispatcher:** gửi Web Push trước; nếu user không có subscription còn hiệu lực hoặc push thất bại thì gửi Telegram.
  Digest (daily cap) luôn đi qua Telegram nếu có, vì gom nhiều deal vào một tin dài.
- **Template:** Push ngắn gọn (`🔥 SGN → HAN giảm 32%` / `1.180.000₫ · VJ · 14/02 · rẻ nhất 90 ngày`). Tin Telegram có điểm deal,
  lý do vì sao là deal, thời điểm ghi nhận giá (và tuổi của giá cache), ghi chú giá tham khảo, nút "Xem giá thật" (deeplink) và "Tạm dừng watch".

---

## 8. Auth — Auth.js v5 + DrizzleAdapter + Google OAuth

User nằm chung Postgres với `watches` nên join trực tiếp. Google OAuth không cần domain riêng hay dịch vụ gửi email.

- **Google Cloud Console:** tạo OAuth client (Web), redirect URI `https://<app>.vercel.app/api/auth/callback/google` và `http://localhost:3000/...`.
  Chỉ xin scope cơ bản `openid email profile` → không cần Google verify app.
- **Allowlist:** callback `signIn` chỉ cho email nằm trong `ALLOWED_EMAILS` (env). Nhờ vậy không cần rate limit đăng nhập hay lo abuse.
- `session.strategy: 'jwt'` để mỗi request không phải query DB.
- JWT vẫn hợp lệ sau khi xoá user → các route ghi (`watches`, `push/subscribe`, `telegram/link`) phải kiểm tra user còn tồn tại.
- `proxy.ts` (Next 16) chỉ làm redirect nhanh cho route `(app)`; kiểm tra quyền thật nằm trong route handler / server component.
- **E2E:** Google OAuth không tự động hoá được → thêm provider `credentials` **chỉ bật khi `E2E=1`** (env validate chặn bật ở production).

---

## 9. Roadmap

Ước lượng tính theo **ngày công full-time**; nếu làm ngoài giờ thì nhân 2–3.

### Phase 0 — Spike provider ✅ (đã chạy 16/09/2026)
`spike/providers.ts` gọi 3 endpoint Travelpayouts cho 5 tuyến × 2 tháng (30 lượt gọi, 0 lỗi).
**Điểm dừng:** độ phủ ngày ≥ 70% và thấy VietJet trên quá nửa số tuyến → **đạt** (gộp endpoint: 97%, VJ 5/5). Chi tiết ở mục "Ràng buộc" #1.
**Còn làm tay trước Phase 2 slice 3:** đọc ToS Data API · đối chiếu 5–10 giá trong báo cáo với web hãng · tra rate limit.

### Phase 1 — Nền móng (2–3 ngày) — ✅ xong 16/09/2026, live tại https://plan-ticket-hunter.vercel.app
✅ Next.js 16.3.5 (TS strict, Tailwind v4, font Be Vietnam Pro) · Vitest · `lib/env.ts` (zod, validate lúc dùng) · Drizzle + postgres-js ·
migration `0000_extensions` (pg_trgm) + `0001_users_airports` · `seed-airports.ts` (42 sân bay) · `/api/health` · GitHub Actions CI (Postgres 17 service) ·
lint / typecheck / 16 unit test / build đều sạch.
✅ Neon (Postgres 18, us-east-2, pooled): migrate + seed 42 sân bay xong; `/api/health` → `{db: ok}` (cold ~3s, ấm ~265ms từ VN; trên Vercel `iad1` sẽ nhanh hơn nhiều).
✅ Vercel Hobby, project `cuong-eede/plan-ticket-hunter`, region `iad1` (`vercel.json`); `DATABASE_URL` là Secret chỉ cho Production;
`/api/health` → `{db: ok}`, ~15ms khi ấm.
⏳ Còn: nối Git ở Vercel dashboard để tự deploy khi push (CLI không đọc được remote alias SSH) · tạo Telegram bot + Google OAuth client
(cần trước Phase 2 slice 2 và 8).
shadcn/ui dời sang slice 5 (chỉ cài khi bắt đầu làm UI).
**Deliverable:** app deploy được, `/api/health` trả `{db: ok}`.

### Phase 2 — MVP (~20 ngày công ≈ 4 tuần)

**⭐ Vertical slice #0 (1,5 ngày, làm trước mọi thứ):** hardcode tuyến SGN→HAN, dùng `MockProvider`, chưa cần auth, `TELEGRAM_CHAT_ID` của chính mình trong env.
Tạo watch → `curl /api/cron/scan` → mock trả giá thấp → detector báo deal → **1 tin Telegram thật về điện thoại**. Slice này đi qua đủ mọi tầng
(provider → db → alert → notification), nên nếu thiết kế có vấn đề sẽ lộ ra ngay từ ngày thứ 2.

| # | Slice | Ước lượng |
|---|---|---|
| 1 | Schema đầy đủ + lease query + queries + `seed-dev.ts` (90 ngày snapshot giả) | 2 ngày |
| 2 | Auth.js Google OAuth + allowlist + credentials cho E2E + `proxy.ts` + settings | 1 ngày |
| 3 | `TravelpayoutsProvider` (2 endpoint, gộp theo ngày) + mapper + fixtures (lấy từ `spike/results/*.json`) + test mapper | 2 ngày |
| 4 | Cache (Postgres) / QuotaCounter / Retry | 1 ngày |
| 5 | UI Search: AirportCombobox, lịch giá theo tháng, deeplink | 1,5 ngày |
| 6 | Watches CRUD + gắn `watch_scan_tasks` + UI (trạng thái "đang thu thập x/8", chặn tạo khi chưa có kênh) | 2 ngày |
| 7 | Scheduler + Scanner + DealDetector + episode + 5 gate + dispatch alert đến hạn + rollup/digest | 3 ngày |
| 8 | WebPush channel + Telegram (liên kết, webhook, gửi) + dispatcher | 2,5 ngày |
| 9 | PWA: Serwist (webpack/turbopack), manifest, icons, InstallPrompt, IosInstallSheet | 2,5 ngày |
| 10 | cron-job.org + 202/`after()` + xác thực cron secret + Sentry + polish | 1 ngày |
| | **Tổng (kể cả slice #0)** | **20 ngày** |

**Deliverable:** đăng nhập Google (email trong allowlist) → xem lịch giá qua provider thật → tạo watch → cài PWA / liên kết Telegram → nhận thông báo khi có deal.

### Phase 3 — Độ tin cậy & chiều sâu (1–2 tuần)
Biểu đồ lịch sử giá (Recharts) · cảnh báo qua Telegram cho admin khi provider lỗi liên tục hoặc số lượt gọi bất thường ·
tìm điểm đến linh hoạt (Travelpayouts có endpoint giá theo điểm đến — kiểm tra lại khi làm).

### Ngoài phạm vi (chỉ làm lại nếu mục tiêu đổi sang sản phẩm công khai)
Email (cần domain) · Zalo OA · i18n · admin dashboard · public deal feed/SEO · affiliate + trang pháp lý · QStash fan-out / external worker ·
Redis · circuit breaker · priority score nhiều thành phần · dispatcher broadcast/budget guard. Khi đó cũng phải lên Vercel Pro.

---

## 10. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Travelpayouts đổi điều khoản / đóng API (như Amadeus) — chỉ có 1 provider | 🟠 | Domain types độc lập; code provider cô lập trong `lib/providers/travelpayouts/`; dữ liệu lịch sử vẫn nằm trong DB; MockProvider giữ app chạy được |
| Thiếu dữ liệu tuyến ít người bay / thiếu Bamboo | 🟡 | UI hiện rõ "chưa có dữ liệu cho tuyến này"; spike đã cho thấy tuyến trục phủ 90–97% |
| Giá cache (Travelpayouts) cũ hoặc sai so với giá đặt thật | 🟠 | `observation_key` loại mẫu trùng; lưu và hiện tuổi của giá; trừ điểm giá quá cũ; deeplink xem giá thật; không dùng từ "đảm bảo" |
| ToS của provider không cho dùng kiểu này | 🟠 | Đọc ToS trong spike; nếu Travelpayouts yêu cầu link affiliate thì gắn vào deeplink (không ảnh hưởng người dùng) |
| Vercel Hobby chỉ cron 1 lần/ngày; cron-job.org timeout ngắn | 🟡 | cron-job.org + `x-cron-secret` (so sánh bằng `timingSafeEqual`); trả 202 rồi xử lý trong `after()`; endpoint idempotent nhờ lease + dedupe key |
| Hai tick chồng nhau xử lý trùng task | 🟡 | Lease nguyên tử `UPDATE … RETURNING` + `lease_id`; test 2 worker song song |
| User không nhận được thông báo nào | 🟡 | Chặn tạo watch khi chưa có kênh; Telegram chạy mọi nền tảng; tạm dừng watch + banner khi mọi kênh chết |
| iOS push chỉ chạy sau A2HS | 🟢 | Telegram là kênh chính cho iOS; onboarding riêng; phát hiện webview |
| Timeout 300s trên Vercel | 🟢 | Ngân sách mềm 250s, tick budget ≤ 20 task, commit từng task |
| Neon 0.5GB | 🟢 | Chỉ lưu quan sát thật; prune > 120 ngày; dọn `provider_cache` hằng ngày |
| Dữ liệu cá nhân của người quen (Nghị định 13/2023) | 🟢 | Chỉ lưu email, Telegram chat_id, watch; cho phép xoá tài khoản; **tuyệt đối không scrape** web hãng bay |
| Mất VAPID key / lộ bot token | 🟡 | Backup ngoài Vercel, không regenerate VAPID; bot token lộ thì revoke qua BotFather + chạy lại `set-telegram-webhook` |

---

## 11. Verification

1. **Unit test (Vitest)** — `deal-detector`, `gates`, `episode`, `cadence`, `mapper`, `money` là hàm thuần nên test dạng bảng. Case bắt buộc:
   - `sample_count < 8` thì không sinh deal · giảm 14% một mình thì không báo · cả 5 gate đều trả `skipped` đúng `errorCode`
   - **Giá lên ≥ 10% rồi xuống lại mức cũ → đợt mới, được báo lại**; giá dao động ±2% quanh mức đã báo → không báo lại
   - Watch vắt qua 2 tháng lấy đúng giá rẻ nhất từ cả 2 task, mỗi ngày so với baseline tháng của nó
   - Cadence tính từ ngày bay gần nhất nằm trong dải ngày của các watch
2. **Mock mạng (MSW)** — chặn request tới API của provider chính và Telegram Bot API, trả fixture; test đường 429/500, retry có tôn trọng `Retry-After`,
   trả stale cache khi lỗi, Telegram 403 → set `telegram_blocked_at`.
3. **Integration với Postgres thật** (Docker `postgres:17` ở local, `services:` trong CI) — `pg-mem` không hỗ trợ `percentile_cont`/`SKIP LOCKED`.
   - Chạy 2 worker song song (2 connection riêng) và khẳng định không task nào bị lease 2 lần;
     giết worker giữa chừng và khẳng định task được lease lại sau khi hết hạn, worker cũ không ghi đè được (sai `lease_id`).
   - Quét 5 lần với MockProvider chế độ `cached` (cùng `source_found_at`) → chỉ có 1 row snapshot, `sample_count` = 1.
   - Rollup prune: snapshot 100 ngày tuổi vẫn còn và được tính vào baseline 90 ngày; snapshot 130 ngày tuổi bị xoá.
4. **Giả lập cron** — `curl -X POST "localhost:3000/api/cron/scan?dry=1" -H "x-cron-secret: dev"` phải trả 202 trong < 1s;
   `scripts/simulate-cron.ts` nén 30 ngày (1.440 tick 30 phút, clock ảo) rồi báo cáo số lượt gọi provider, số alert/user/ngày (mục tiêu 0.5–2),
   số alert bị dời vì quiet hours **và đã được gửi lúc 07:00**, task bị bỏ đói.
5. **Web Push** — Chrome desktop trên `localhost` (DevTools → Application → Push). Android/iOS thật dùng `cloudflared tunnel --url http://localhost:3000`
   (iOS từ chối cert self-signed). Test 410: xoá site data rồi gửi lại, khẳng định `revoked_at` đã được set. Bật SW ở dev bằng `next dev --webpack`.
6. **Telegram** — dùng tunnel ở trên cho webhook khi dev: liên kết bằng `/start <token>` → `telegram_chat_id` được lưu; token hết hạn hoặc dùng lại bị từ chối;
   chặn bot rồi gửi alert → `telegram_blocked_at` được set, watch chuyển `paused_reason='NO_CHANNEL'` nếu cũng không có push.
7. **PWA installability** — kiểm tra bằng DevTools → Application → Manifest (Lighthouse đã bỏ category PWA). Playwright khẳng định `display === 'standalone'` và có icon maskable 512.
   `next build` (đúng chế độ webpack/turbopack đã chọn) phải sinh ra `sw.js`. **Thử cài thủ công trên iPhone Safari + Android Chrome trước mỗi release.**
8. **E2E (Playwright, `E2E=1`)** — đăng nhập bằng credentials provider → email ngoài allowlist bị từ chối → tạo watch khi chưa có kênh bị chặn →
   liên kết Telegram giả (gọi webhook với token) → tạo watch SGN→HAN target 1.5tr → scan với `MOCK_FORCE_DEAL` → có 1 `alert_event` + 1 notification `sent`
   → `/alerts` hiện đúng deal → **scan lần 2 ngay lập tức thì không sinh alert mới** (test hồi quy chống spam quan trọng nhất).
9. **Seed data** (`seed-dev.ts`) — 3 user (chỉ push / chỉ Telegram / cả hai); 6 scan_tasks với các mẫu giá: phẳng / giảm dần 25% / sụt 40% /
   chỉ có 3 snapshot / mùa Tết / sắp bay; 12 watches (có watch vắt qua 2 tháng, có watch `pax=3`); chạy rollup ngay sau seed.

---

## Các file quan trọng nhất (tạo mới)

- `spike/providers.ts` — quyết định provider; kết quả của nó định hình phần còn lại
- `src/lib/db/schema.ts` — schema + index; mọi phần khác phụ thuộc file này
- `src/lib/providers/types.ts` — hợp đồng `FlightProvider` + domain types (không được lộ format của provider nào)
- `src/lib/alerts/scheduler.ts` — tick budget + lease nguyên tử
- `src/lib/alerts/deal-detector.ts` + `gates.ts` + `episode.ts` — chấm điểm deal, 5 gate chống spam, đợt deal
- `src/app/api/cron/scan/route.ts` — điểm vào của luồng nền (202 → scheduler → scanner → detector → dispatcher trong `after()`)
- `src/sw.ts` — service worker: caching + push handlers
