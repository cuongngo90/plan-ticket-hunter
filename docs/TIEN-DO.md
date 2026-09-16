# Tiến độ — bàn giao cho session mới

Ghi lại những gì **đã làm và đã kiểm chứng**, để một session mới tiếp tục được ngay mà không phải dò lại.
Kế hoạch gốc: [`docs/plan/ke-hoach-san-ve.md`](plan/ke-hoach-san-ve.md) (nguồn chân lý). Quy ước code: [`CLAUDE.md`](../CLAUDE.md).

**Cập nhật lần cuối:** 16/09/2026 · commit mới nhất `c3557ce`.

## Đang ở đâu

| Giai đoạn | Trạng thái |
|---|---|
| Phase 0 — spike provider | ✅ Travelpayouts đạt, đã chốt làm provider duy nhất |
| Phase 1 — nền móng | ✅ Live tại https://plan-ticket-hunter.vercel.app |
| Phase 2 slice #0 — vertical slice | ✅ Chạy thật, nhận được tin Telegram |
| Phase 2 slice 1 — schema + queries + seed dev | ✅ 13 bảng, dữ liệu dev |
| Phase 2 slice 2–10 | ⬜ Chưa làm |

Lịch sử commit (nhánh `main`, remote `plan-ticket-hunter`):

| Commit | Nội dung |
|---|---|
| `965e492` | Phase 0 spike + Phase 1 nền móng |
| `4b149ee` | `vercel.json` ghim region `iad1` |
| `9b6033f` | Đánh dấu Phase 1 xong |
| `c5de10b` | Vertical slice #0 |
| `cd1598e` | Sửa các phát hiện của code review slice #0 |
| `c3557ce` | Slice 1: schema đầy đủ, queries, seed dev |

## Hạ tầng đã dựng (không phải làm lại)

| Thứ | Giá trị | Ghi chú |
|---|---|---|
| GitHub | `cuongngo90/plan-ticket-hunter` | Remote tên `plan-ticket-hunter`, dùng SSH alias `github-cuongngo90` (key riêng `~/.ssh/id_ed25519_github_cuongngo90`) |
| Vercel | project `cuong-eede/plan-ticket-hunter` | Region `iad1`. **Chưa nối Git** → push không tự deploy; deploy bằng `npx vercel deploy --prod` |
| Neon | branch `production` (Vercel dùng) và branch `dev` (máy local dùng) | `.env.local` phải trỏ branch **dev** |
| Telegram | bot `@sen_ve_bot` ("Ticket Hunter") | Token trong `.env.local`; chưa đặt webhook (slice 8 mới cần) |
| Git author | `Cuong Ngo <cuongophu@gmail.com>` | Đặt riêng cho repo này |

`.env.local` hiện có: `DATABASE_URL` (branch dev), `TEST_DATABASE_URL` (cùng branch dev), `VERCEL_OIDC_TOKEN`,
`MOCK_PROVIDER=1`, `MOCK_FORCE_DEAL=SGN-HAN`, `CRON_SECRET`, `ALLOWED_EMAILS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Trên Vercel (Production) mới chỉ có `DATABASE_URL`.

## Đã kiểm chứng bằng cách chạy thật

- `/api/health` trên production trả `{"db":"ok"}`, ~15ms khi ấm.
- Slice #0 end-to-end trên branch dev: 31 snapshot, 1 alert (SGN→HAN 16/10, 626.000₫, VJ, 80/100), **1 tin Telegram thật**.
  Quét lại ngay: 0 snapshot, 0 alert. Không có `?wait=1` thì trả 202 trong 26ms. Secret sai → 401.
- `npm run db:seed:dev` → 3 user, 12 watch, 18 scan task, 632 snapshot; chạy lần hai không sinh thêm.
- 65 unit test, 6 integration test, lint, typecheck, build: sạch (16/09/2026).

## Việc còn treo (làm trước khi đi tiếp)

1. **Migration `0002`, `0003`, `0004` mới chỉ chạy trên branch dev.** Trước khi deploy bản mới lên Vercel phải chạy chúng
   trên branch production (đổi `DATABASE_URL` sang chuỗi của branch production rồi `npm run db:migrate`, sau đó đổi lại).
2. **Chưa xem kết quả CI** của `c5de10b`, `cd1598e`, `c3557ce` trên GitHub Actions.
3. **Chưa nối Git cho Vercel** (Settings → Git → Connect Git Repository; CLI không đọc được remote alias SSH).
4. Ba việc tay của Phase 0 vẫn chưa làm: đọc ToS Travelpayouts Data API, đối chiếu 5–10 giá với web hãng, tra rate limit.
   **Cần xong trước slice 3.**

## Slice tiếp theo và thứ tự đề xuất

| Slice | Nội dung | Cần gì từ user |
|---|---|---|
| 2 | Auth.js Google OAuth + allowlist + `proxy.ts` + settings | OAuth client ở Google Cloud Console → `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET` |
| 5 | UI Search: AirportCombobox, lịch giá theo tháng, deeplink | Không (dùng `MockProvider`) |
| 6 | Watches CRUD + UI | Không |
| 3 | `TravelpayoutsProvider` thật | Xong 3 việc tay ở trên |
| 7, 8, 9, 10 | Detector đầy đủ + 5 gate + rollup · Web Push + Telegram liên kết · PWA · cron-job.org + Sentry | Xem plan §9 |

Slice 5 và 6 làm được ngay mà không cần gì thêm, nên nếu muốn thấy giao diện sớm thì làm trước.

## Những quyết định dễ bị làm sai lại

- **Provider:** chỉ Travelpayouts. Amadeus Self-Service đã đóng 17/07/2026; Duffel bị loại vì dành cho doanh nghiệp bán vé.
- **Đơn vị quét:** `scan_task` = tuyến × tháng bay. Watch chỉ là bộ lọc, nối N-N qua `watch_scan_tasks`.
- **Lease phải là một câu lệnh** `UPDATE … FOR UPDATE SKIP LOCKED RETURNING` kèm `lease_id`.
- **`observation_key` = `found_at` của provider**, nếu không giá cache đọc lại sẽ thành mẫu giả.
- **Dispatcher nhận việc rồi mới gửi**, gửi lỗi thì trả về hàng đợi (tối đa 5 lần) — không được đánh dấu đã gửi rồi bỏ.
- **Driver `postgres` (postgres-js) cho mọi môi trường**, không dùng Neon HTTP driver.
- **Tìm kiếm không dấu** dựa vào cột `search_text` tính sẵn, không dùng `unaccent()`.
- Detector mới có rule ABSOLUTE; gate 1–4 và episode thuộc slice 7. `watches.episode_no` đã có sẵn và đã vào `dedupe_key`.

## Chạy lại từ đầu trên máy mới

```powershell
npm install
Copy-Item .env.example .env.local     # điền DATABASE_URL (branch dev), TEST_DATABASE_URL, TELEGRAM_*, CRON_SECRET, MOCK_PROVIDER=1
npm run db:migrate
npm run db:seed:airports
npm run db:seed:dev
npm run dev
curl -X POST "http://localhost:3000/api/cron/scan?wait=1" -H "x-cron-secret: <CRON_SECRET>"
```
