# App thực đơn ăn dặm

Monorepo cho ứng dụng lập thực đơn ăn dặm: web React (mobile-first) + API NestJS (Hexagonal) + PostgreSQL.

Tài liệu: [phân tích hệ thống](docs/01-phan-tich-he-thong.md) · [kế hoạch triển khai](docs/02-ke-hoach-trien-khai.md) · [chiến lược kiểm thử](docs/03-chien-luoc-kiem-thu.md) · thiết kế gốc trong [design/](design/).

## Cấu trúc

| Thư mục               | Nội dung                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/api`            | NestJS 12 (ESM), Prisma 7, kiến trúc Hexagonal (`src/modules/<module>/{domain,application,adapters}`)       |
| `apps/web`            | React 19 + Vite 8                                                                                           |
| `packages/api-client` | Client TypeScript + hook TanStack Query **sinh tự động** từ OpenAPI (orval) — không sửa tay `src/generated` |
| `catalog`             | Dữ liệu món/nguyên liệu (seed)                                                                              |

## Yêu cầu

- Node.js 24 (`nvm use`)
- Docker (PostgreSQL local và Testcontainers khi chạy test)

## Chạy local

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up                                   # PostgreSQL :5433, Mailpit :8025
npm run prisma:deploy --workspace apps/api      # áp migration
npm run db:seed --workspace apps/api            # nạp catalog (giai đoạn, nguyên liệu, món)
npm run dev                                     # API :3000, web :5173
```

- Swagger: http://localhost:3000/api/docs
- Mailpit (xem email đặt lại mật khẩu): http://localhost:8025
- Health: http://localhost:3000/api/v1/health

## Kiểm thử

```bash
npm test          # tất cả workspace
npm run test:cov  # kèm coverage — fail nếu < 100% line (NFR-010)
npm run test:perf --workspace apps/api  # benchmark menu engine, chạy riêng (không kèm coverage)
```

API có 3 project Vitest tính coverage: `unit` (domain, application, kiến trúc), `integration` và `e2e` (tự khởi động PostgreSQL bằng Testcontainers); thêm project `perf` chạy riêng.

## Catalog món ăn

Dữ liệu trong `catalog/*.json` (review qua PR). `npm run catalog:validate --workspace apps/api` kiểm tra tham chiếu, biến thể theo giai đoạn và BR-08 (không có nguyên liệu chỉ dùng từ 12 tháng trong món cho bé nhỏ hơn). Món ở trạng thái `draft` cho tới khi chuyên gia dinh dưỡng duyệt; production từ chối seed món `draft` (`node dist/validate-catalog.js --production` để xem danh sách).

## Deploy staging

| Phần     | Nơi chạy                           | Cấu hình                                  |
| -------- | ---------------------------------- | ----------------------------------------- |
| Web      | Vercel (Root Directory `apps/web`) | `apps/web/vercel.json`                    |
| API      | Render, Docker, Singapore          | `render.yaml`, `apps/api/Dockerfile`      |
| Database | Supabase                           | `DATABASE_URL` = session pooler, xem dưới |

- Vercel chuyển `/api/*` sang Render nên web và API cùng origin: cookie refresh (`SameSite=Lax`, path `/api/v1/auth`) hoạt động trên mọi trình duyệt, không cần CORS.
- `DATABASE_URL` của Supabase: dùng **session pooler** (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432`) và thêm `?sslmode=require&uselibpqcompat=true`.
  - Direct connection (`db.<ref>.supabase.co`) chỉ có IPv6, Render và nhiều mạng không tới được.
  - Transaction pooler (:6543) làm `prisma migrate deploy` treo vì không giữ được advisory lock.
  - Thiếu `sslmode` thì `pg` kết nối không mã hóa; `sslmode=require` đơn thuần lại đòi xác minh CA riêng của Supabase (lỗi `SELF_SIGNED_CERT_IN_CHAIN`). `uselibpqcompat=true` mã hóa nhưng không xác minh CA — đủ cho staging; production nạp CA của Supabase (`sslrootcert`).
- Container chạy `prisma migrate deploy` trước khi khởi động API.
- Nạp catalog một lần (và mỗi khi `catalog/` đổi): `DATABASE_URL=… NODE_ENV=production npm run db:seed --workspace apps/api -- --allow-draft`. Production thật bỏ `--allow-draft`.
- `SMTP_URL=disabled`: staging không gửi email đặt lại mật khẩu (chỉ ghi cảnh báo vào log).
- `TRUST_PROXY=2` (Vercel → Render): giới hạn tần suất tính theo IP người dùng; để `0` khi gọi API trực tiếp.
- Gói free của Render ngủ sau 15 phút không dùng; yêu cầu đầu tiên sau đó chờ khoảng 30–50 giây.

## Đổi API

```bash
npm run openapi:export --workspace apps/api     # ghi apps/api/openapi.json
npm run generate --workspace packages/api-client
```

Commit cả `openapi.json` và `packages/api-client/src/generated` — CI kiểm tra không có diff.

## Quy tắc kiến trúc backend

`npm run lint` áp luật ranh giới trong [apps/api/eslint.boundaries.js](apps/api/eslint.boundaries.js): domain không import NestJS/Prisma/adapter; application không import Prisma/adapter; adapter không import adapter của module khác.
