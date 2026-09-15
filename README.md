# Săn Vé

Web app + PWA theo dõi giá vé máy bay (chủ yếu nội địa VN) và báo khi có vé rẻ — dùng cá nhân cho vài người quen.
Kế hoạch đầy đủ: [`docs/plan/ke-hoach-san-ve.md`](docs/plan/ke-hoach-san-ve.md).

**Trạng thái:** Phase 0 (spike provider) ✅ · Phase 1 (nền móng) ✅ chạy trên Neon, chờ deploy Vercel.

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
| `npm run db:check` | Kiểm tra nhanh (chỉ đọc): phiên bản Postgres, extension, bảng, thử tìm sân bay không dấu |
| `npm run spike` | Chạy lại spike Travelpayouts (xem `spike/README.md`) |

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
