# Phase 0 — Spike Travelpayouts

Script độc lập (không cần cài gì, Node ≥ 22.18) kiểm tra dữ liệu **Travelpayouts Data API** có đủ tốt cho các tuyến nội địa trước khi dựng app.
Xem mục "Phase 0" trong `docs/plan/ke-hoach-san-ve.md`. **Đã chạy 16/09/2026 — đạt.**

## 1. Lấy token

Đăng ký partner tại travelpayouts.com → Profile/API → **API token** (miễn phí), rồi:

```powershell
Copy-Item spike/.env.example spike/.env   # điền token vào spike/.env, KHÔNG điền vào .env.example
```

## 2. Chạy

```powershell
node --env-file=spike/.env spike/providers.ts
```

Mặc định: 5 tuyến SGN–HAN, SGN–DAD, HAN–PQC, SGN–VCA, HAN–DAD × (tháng tới, 3 tháng tới) × 3 endpoint = 30 lượt gọi.

| Tham số | Ý nghĩa |
|---|---|
| `--routes=SGN-HAN,HAN-DAD` | Đổi tuyến |
| `--months=2026-10,2026-12` | Đổi tháng |

## 3. Kết quả

`spike/results/<thời gian>.md` (báo cáo) và `.json` (dữ liệu thô, token đã được che). Thư mục này nằm trong `.gitignore`.

Báo cáo có:
- **Kết luận theo điểm dừng của plan:** đạt khi độ phủ ngày (trung vị) ≥ 70% **và** thấy VietJet trên quá nửa số tuyến.
  Chấm cả từng endpoint lẫn "gộp các endpoint" (app dùng `month-matrix` cho độ phủ + `prices_for_dates` cho tên hãng/deeplink).
- Chi tiết theo tuyến × tháng, tên trường thật của response, số lượt gọi/latency.
- Bảng mẫu để **đối chiếu tay** với web hãng/đại lý và checklist ToS/rate limit — điền tay.

File `.json` cũng là nguồn fixture cho test mapper ở Phase 2 (slice 3).
