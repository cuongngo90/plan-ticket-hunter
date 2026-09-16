# Săn Vé

Web app + PWA theo dõi giá vé máy bay (chủ yếu nội địa VN) và báo khi có vé rẻ — dùng cá nhân cho vài người quen.
Kế hoạch đầy đủ: [`docs/plan/ke-hoach-san-ve.md`](docs/plan/ke-hoach-san-ve.md).

**Trạng thái:** Phase 0 (spike provider) ✅ · Phase 1 (nền móng) ✅ — live tại https://plan-ticket-hunter.vercel.app ([health](https://plan-ticket-hunter.vercel.app/api/health)).

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 · Drizzle ORM + `postgres` (postgres-js) · Neon Postgres · Vitest · Vercel Hobby.

## Chạy local

Yêu cầu: Node ≥ 22.18, một database Postgres ≥ 13 (Neon miễn phí hoặc Docker).

```powershell
npm install
Copy-Item .env.example .env.local      # điền DATABASE_URL

# Postgres local bằng Docker (nếu không dùng Neon):
docker run -d --name sanve-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sanve -p 5432:5432 postgres:17
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/sanve

npm run db:migrate          # tạo extension pg_trgm + bảng users, airports
npm run db:seed:airports    # 42 sân bay VN + Đông Nam Á + Đông Á
npm run dev                 # http://localhost:3000 — /api/health phải trả {"db":"ok"}
```

## Scripts

| Lệnh | Việc |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `next typegen` + `tsc` · Vitest |
| `npm run db:generate` | Sinh migration từ `src/lib/db/schema.ts` vào `drizzle/` |
| `npm run db:migrate` | Chạy migration (đọc `DATABASE_URL` từ `.env.local`) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed:airports` | Upsert danh sách sân bay |
| `npm run db:seed:dev` | Dữ liệu dev: 3 user, 6 tuyến với các mẫu giá khác nhau, 90 ngày lịch sử, 12 watch (từ chối chạy nếu DB giống production, trừ khi thêm `--force`) |
| `npm run test:int` | Integration test trên Postgres thật (cần `TEST_DATABASE_URL`, không có thì tự skip) |
| `npm run dev:watch` | Tạo user + watch thử nghiệm (vertical slice #0) |
| `npm run telegram:chat-id` | In chat id Telegram của bạn sau khi nhắn cho bot |
| `npm run db:check` | Kiểm tra nhanh (chỉ đọc): phiên bản Postgres, extension, bảng, thử tìm sân bay không dấu |
| `npm run spike` | Chạy lại spike Travelpayouts (xem `spike/README.md`) |

## Vertical slice #0 (Phase 2): từ watch tới tin Telegram

Chạy hết đường đi provider → db → alert → notification bằng dữ liệu giả, không gọi API thật.

```powershell
# 1. Tạo bot: nhắn @BotFather → /newbot → dán token vào TELEGRAM_BOT_TOKEN trong .env.local
# 2. Nhắn 1 tin bất kỳ cho bot, rồi:
npm run telegram:chat-id          # in ra TELEGRAM_CHAT_ID=... → dán vào .env.local
# 3. Đặt MOCK_PROVIDER=1, MOCK_FORCE_DEAL=SGN-HAN, CRON_SECRET=<chuỗi ngẫu nhiên ≥16 ký tự>
npm run dev:watch                 # tạo user + watch SGN→HAN, mục tiêu 1.500.000₫
npm run dev
curl -X POST "http://localhost:3000/api/cron/scan?wait=1" -H "x-cron-secret: <CRON_SECRET>"
```

`?wait=1` chạy tick ngay và trả về tóm tắt (chỉ hoạt động ngoài production; production luôn trả 202 rồi chạy trong `after()`).
Kết quả mong đợi: `alertsCreated: 1`, `dispatch.sent: 1`, và **một tin Telegram thật** về máy.
Gọi lại lần nữa trong cùng giờ thì phải ra `snapshotsInserted: 0` và `alertsCreated: 0` — đó là cơ chế chống spam.

## Deploy (Vercel Hobby)

1. Tạo database trên Neon → copy **pooled connection string** (host có `-pooler`).
2. Chạy migration + seed một lần từ máy local với `DATABASE_URL` đó.
3. Import repo vào Vercel → Settings → Environment Variables → `DATABASE_URL`.
4. Deploy → mở `https://<app>.vercel.app/api/health`.

## Cấu trúc

```
src/app/            # routes (App Router); api/health
src/lib/env.ts      # validate env bằng zod (lazy — build không cần secret)
src/lib/db/         # schema, client, dữ liệu seed
src/lib/utils/      # hàm thuần dùng chung
drizzle/            # SQL migrations (commit vào git)
scripts/            # script chạy tay (seed, …)
spike/              # Phase 0 — script độc lập đánh giá Travelpayouts
```
