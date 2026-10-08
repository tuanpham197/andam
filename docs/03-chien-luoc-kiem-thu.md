# Chiến lược kiểm thử & danh mục test case — App thực đơn ăn dặm

| Mục | Nội dung |
|---|---|
| Phiên bản | v0.2 — 07/10/2026 (thêm mục 5.13 Nhiều người chăm) |
| Căn cứ | [01-phan-tich-he-thong.md](01-phan-tich-he-thong.md) (FR / BR / NFR / UC), [02-ke-hoach-trien-khai.md](02-ke-hoach-trien-khai.md) (phase) |
| Yêu cầu chính | **100% line coverage** (NFR-010) · test case đặc biệt (biên, lỗi, bất thường, bảo mật, đồng thời, thời gian), không chỉ luồng bình thường · responsive mobile (NFR-014) |

---

## 1. Chính sách coverage

| Quy tắc | Chi tiết |
|---|---|
| Ngưỡng | `lines: 100` cho `apps/api/src/**` và `apps/web/src/**`; thêm `branches: 100` cho `apps/api/src/modules/*/domain/**`. CI fail nếu thấp hơn. |
| Công cụ | `@vitest/coverage-v8`, report `text`, `lcov`, `json-summary`; gộp coverage của project `unit` + `integration` + `e2e` (API) trước khi so ngưỡng. |
| Loại trừ (duy nhất) | Code sinh tự động (`src/generated/prisma/**`, `packages/api-client/**`), file chỉ có `type`/`interface` (không sinh dòng runtime), `main.ts` (chỉ 1 dòng `await bootstrap()`; logic nằm trong `bootstrap.ts` và được test), file cấu hình (`*.config.ts`). |
| Cấm | `/* v8 ignore */` / `istanbul ignore` trừ khi có comment giải thích và được duyệt trong PR (ví dụ nhánh không thể xảy ra do TypeScript exhaustiveness — khi đó dùng `assertNever()` và test nó). |
| Chất lượng hơn con số | 100% line không đảm bảo test tốt. Bổ sung: (1) mọi test phải có `expect` về **hành vi**, không chỉ “không throw”; (2) test đặt tên theo mã BR/FR/TC; (3) **mutation testing** (Stryker) cho `domain/` từ P7, mục tiêu mutation score ≥ 85%. |

---

## 2. Kim tự tháp test & công cụ

| Tầng | Phạm vi | Công cụ | Đặc điểm |
|---|---|---|---|
| U — Unit domain | Entity, value object, domain service (`AgeCalculator`, `SafetyFilter`, `MenuEngine`…) | Vitest, `fast-check` | Không mock, không I/O, chạy < 5 s toàn bộ |
| A — Application | Use case với adapter in-memory (fake repo, `FixedClock`, `SequenceIdGenerator`) | Vitest | Kiểm luồng + mọi nhánh lỗi + sự kiện phát ra |
| I — Integration | Adapter Prisma, transaction, migration, ràng buộc DB | Vitest + Testcontainers `postgres:16` | 1 container/worker, mỗi test trong transaction rollback hoặc truncate |
| E — API e2e | App Nest thật + DB thật qua HTTP | Vitest + Supertest | Auth, validation, ownership, mã lỗi, rate limit |
| C — Component FE | Component, hook, page với MSW | Vitest + Testing Library + `user-event` | Tương tác, a11y role/aria, trạng thái loading/lỗi/rỗng |
| S — E2E hệ thống | Web + API + DB | Playwright (WebKit, Chromium) | 5 luồng chính × 7 viewport, visual regression |

---

## 3. Kỹ thuật thiết kế test case

| Kỹ thuật | Áp dụng cho |
|---|---|
| Phân vùng tương đương (EP) | Enum (dị ứng, lượng ăn, trạng thái sức khỏe), loại email/mật khẩu |
| Phân tích giá trị biên (BVA) | Tuổi (6/8/10/12/24 tháng), độ dài chuỗi, `weeksEarly` 0/1/16/17, rating 0/1/5/6, cửa sổ 3/7/30 ngày, thời gian hết hạn token |
| Bảng quyết định | Bộ lọc an toàn (BR-01..07), quy tắc tạm dừng (BR-40/41), điều chỉnh sức khỏe (BR-50..53) |
| Chuyển trạng thái | `PlannedMeal` (planned → prepared → eaten/refused/skipped), `HealthEpisode`, `PausedIngredient` (paused ↔ resumed), refresh token family, `ChildInvite` (pending → accepted / revoked / expired) |
| Ma trận quyền | Route × vai trò (chủ, người chăm, người ngoài) theo BR-73 — sinh tự động từ danh sách route |
| Property-based | `SafetyFilter`, `MenuEngine` (không bao giờ vi phạm lọc cứng; deterministic), `AgeCalculator` (đơn điệu theo ngày) |
| Đồng thời | Sinh kế hoạch cùng lúc, double-submit ghi nhận, 2 tab refresh token, đổi món song song |
| Thời gian & múi giờ | Nửa đêm theo `Asia/Ho_Chi_Minh` vs UTC, cuối tháng, năm nhuận, tuần vắt qua tháng/năm |
| Error guessing / chaos | DB mất kết nối, lỗi giữa transaction, mạng chậm/mất, phiên hết hạn giữa form |
| Bảo mật | Truy cập chéo user, token giả mạo/hết hạn/dùng lại, injection, payload quá lớn, dò email |
| Responsive & a11y | 7 viewport, landscape, bàn phím ảo, safe-area, zoom 200%, bàn phím/Screen reader |

---

## 4. Checklist case đặc biệt chung

Áp dụng cho **mọi** endpoint / form / component, ngoài các case riêng ở mục 5.

| # | Nhóm | Case bắt buộc kiểm |
|---|---|---|
| X1 | Rỗng | `undefined`, `null`, `""`, chỉ khoảng trắng, mảng rỗng, object rỗng |
| X2 | Độ dài | min − 1, min, max, max + 1; chuỗi rất dài (10.000 ký tự) |
| X3 | Unicode tiếng Việt | Có dấu dạng NFC và NFD (tổ hợp), `đ/Đ`, emoji, ký tự RTL, zero-width space → chuẩn hóa NFC, trim |
| X4 | Injection | `' OR 1=1 --`, `%`, `_` (wildcard LIKE), `<script>`, `{{7*7}}` → lưu/hiển thị như text thuần |
| X5 | Kiểu sai | Số dạng chuỗi, số âm, số thực thay số nguyên, `NaN`, ngày không tồn tại (`2026-02-30`), UUID sai định dạng |
| X6 | Trường thừa | Field lạ trong body → `400` (whitelist) |
| X7 | Trùng lặp | Phần tử trùng trong mảng → khử trùng; gửi 2 lần liên tiếp (double-submit) |
| X8 | Quyền | Không token, token hết hạn, token user khác, id của user khác → `401` / `404`; từ P5b thêm người chăm làm việc của chủ → `403 OWNER_ONLY` |
| X9 | Không tồn tại | id hợp lệ nhưng không có → `404` Problem Details |
| X10 | Lỗi hạ tầng | DB timeout/mất kết nối → `503`, không lộ stack/SQL |
| X11 | Mạng (FE) | Chậm (skeleton), lỗi (thông báo + Thử lại), offline (banner), 401 giữa chừng (refresh trong suốt) |
| X12 | Hiển thị | Tên món/nguyên liệu rất dài xuống dòng, số lớn (99+), danh sách 0 / 1 / rất nhiều phần tử |

---

## 5. Danh mục test case theo module

**Ký hiệu loại:** N = bình thường · B = biên · L = lỗi/không hợp lệ · S = bảo mật · D = đồng thời · T = thời gian · P = property-based.
**Tầng:** U, A, I, E, C, S (mục 2).

### 5.1 Tính tuổi & giai đoạn (`AgeCalculator`, `StageResolver`) — BR-10..12

Quy ước tính tháng: `months` = số tháng lớn nhất sao cho `addMonths(birth, months) ≤ today` (cộng tháng kiểu “kẹp cuối tháng”: 31/01 + 1 tháng = 28/02); `days` = số ngày còn lại.

| ID | Kịch bản | Dữ liệu | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|---|
| TC-AGE-001 | Tuổi bé Na trong thiết kế | sinh 12/01/2026, hôm nay 24/09/2026 | 8 tháng 12 ngày · GĐ2 | N | U |
| TC-AGE-002 | Sinh non 3 tuần | như trên, `weeksEarly = 3` | 7 tháng 22 ngày (hiệu chỉnh) · GĐ1 | N | U |
| TC-AGE-003 | Tròn 6 tháng | sinh 24/03/2026, hôm nay 24/09/2026 | 6 tháng 0 ngày · GĐ1 | B | U |
| TC-AGE-004 | Thiếu 1 ngày tròn 6 tháng | sinh 25/03/2026, hôm nay 24/09/2026 | 5 tháng 30 ngày · `CHILD_TOO_YOUNG` | B | U |
| TC-AGE-005 | Ranh giới GĐ1/GĐ2 | đúng 8 tháng 0 ngày / 7 tháng 30 ngày | GĐ2 / GĐ1 | B | U |
| TC-AGE-006 | Ranh giới GĐ2/GĐ3, GĐ3/GĐ4 | đúng 10 và 12 tháng, và trước 1 ngày | GĐ3/GĐ2, GĐ4/GĐ3 | B | U |
| TC-AGE-007 | Trên 24 tháng | 24 tháng 0 ngày / 24 tháng 1 ngày | GĐ4 / `CHILD_TOO_OLD` | B | U |
| TC-AGE-008 | Sinh ngày 31, tháng sau ngắn | sinh 31/01/2026, hôm nay 28/02/2026 | 1 tháng 0 ngày | T | U |
| TC-AGE-009 | Năm nhuận | sinh 29/02/2024, hôm nay 28/02/2025 và 01/03/2025 | 12 tháng 0 ngày / 12 tháng 1 ngày | T | U |
| TC-AGE-010 | Sinh hôm nay | sinh = hôm nay | 0 tháng 0 ngày · `CHILD_TOO_YOUNG` | B | U |
| TC-AGE-011 | Ngày sinh tương lai | sinh = hôm nay + 1 | `INVALID_BIRTH_DATE` | L | U, E |
| TC-AGE-012 | Tuổi thật ≥ 6 tháng nhưng tuổi hiệu chỉnh < 6 tháng | 6 tháng 5 ngày, sinh non 2 tuần | `CHILD_TOO_YOUNG` (theo tuổi hiệu chỉnh) | B | U |
| TC-AGE-013 | Sinh non làm tụt giai đoạn | 8 tháng 3 ngày, sinh non 1 tuần | 7 tháng 27 ngày · GĐ1 | B | U |
| TC-AGE-014 | `weeksEarly` biên | `isPremature = true` với 0 / 1 / 16 / 17 tuần | lỗi / ok / ok / lỗi | B | U, E |
| TC-AGE-015 | `weeksEarly` khi không sinh non | `isPremature = false`, `weeksEarly = 3` | bỏ qua, lưu 0 | L | U |
| TC-AGE-016 | Nửa đêm theo múi giờ user | 00:30 ngày 24/09 giờ VN (= 17:30 UTC ngày 23/09) | “hôm nay” = 24/09 | T | U, A |
| TC-AGE-017 | Đơn điệu | với mọi ngày sinh hợp lệ, `today` tăng → tuổi không giảm | luôn đúng | P | U |
| TC-STG-001 | Chọn giai đoạn thấp hơn | auto GĐ2, override GĐ1 | `effectiveStage = 1`, `isOverride = true` | N | U |
| TC-STG-002 | Chọn giai đoạn cao hơn | auto GĐ2, override GĐ3 | `STAGE_ABOVE_AGE` | L | U, E |
| TC-STG-003 | Override bằng auto | auto GĐ2, override GĐ2 | lưu `null`, `isOverride = false` | B | U |
| TC-STG-004 | Giá trị ngoài miền | override 0, 5, 1.5, "2" | `400` | L | E |
| TC-STG-005 | Bật sinh non → reset override | override GĐ1, bật sinh non | override = `null` | N | U |
| TC-STG-006 | Bé lớn lên, override vẫn hợp lệ | override GĐ1, auto đổi GĐ2 → GĐ3 | giữ GĐ1, vẫn cảnh báo | T | U |
| TC-STG-007 | Tuổi giảm (sửa ngày sinh) làm override vượt tuổi | override GĐ2, sửa ngày sinh → auto GĐ1 | override bị xóa | B | U |
| TC-STG-008 | Trạng thái 4 giai đoạn | auto GĐ2 | GĐ1 open, GĐ2 selected, GĐ3/4 locked kèm `unlockAt` 10/12 tháng | N | U |

### 5.2 Định danh & phiên đăng nhập (`identity`) — FR-100..106, NFR-017/018

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-AUTH-001 | Đăng ký hợp lệ + đồng ý | `201`, access token, cookie refresh `HttpOnly; Secure; SameSite=Lax`, lưu consent version | N | A, E |
| TC-AUTH-002 | Email trùng khác hoa/thường (`A@x.com` vs `a@x.com`) | `409 EMAIL_TAKEN` | B | A, E |
| TC-AUTH-003 | Email có khoảng trắng đầu/cuối | được trim, lưu lowercase | B | U |
| TC-AUTH-004 | Email sai định dạng (`a@`, `@b.com`, `a b@c.com`, 255+ ký tự) | `400` | L | E |
| TC-AUTH-005 | Mật khẩu 7 / 8 / 128 / 129 ký tự | lỗi / ok / ok / lỗi | B | U, E |
| TC-AUTH-006 | Mật khẩu phổ biến (`12345678`, `password`) | `422 WEAK_PASSWORD` | L | U |
| TC-AUTH-007 | Mật khẩu Unicode/emoji | chấp nhận, đăng nhập lại được (chuẩn hóa NFC trước khi băm) | B | A |
| TC-AUTH-008 | Thiếu consent hoặc `consentVersion` cũ | `422 CONSENT_REQUIRED` | L | E |
| TC-AUTH-009 | Sai mật khẩu vs email không tồn tại | cùng `401 INVALID_CREDENTIALS`, cùng thông điệp; chênh thời gian phản hồi < 50 ms (luôn chạy verify với hash giả) | S | E |
| TC-AUTH-010 | Sai 5 lần trong 15 phút | lần 6 (kể cả đúng mật khẩu) → `429 TOO_MANY_ATTEMPTS`; sau 15 phút (FixedClock) đăng nhập được | S, T | A |
| TC-AUTH-011 | Access token hết hạn (15 phút + 1 s) | `401` | T | E |
| TC-AUTH-012 | Token sửa payload / sai chữ ký / `alg: none` | `401` | S | E |
| TC-AUTH-013 | Refresh hợp lệ | token mới, token cũ bị thu hồi | N | A, E |
| TC-AUTH-014 | **Dùng lại refresh token cũ** | `401`, thu hồi toàn bộ `family_id` (token mới nhất cũng hết hiệu lực) | S | A, E |
| TC-AUTH-015 | Refresh token hết hạn (30 ngày + 1 s) | `401` | T | A |
| TC-AUTH-016 | 2 request refresh đồng thời từ FE | FE chỉ gửi 1 (single-flight), request còn lại chờ kết quả chung | D | C |
| TC-AUTH-017 | Đăng xuất 2 lần | lần 2 vẫn `204` (idempotent) | B | E |
| TC-AUTH-018 | Quên mật khẩu với email không tồn tại | `202`, không gửi mail | S | A |
| TC-AUTH-019 | Link đặt lại dùng 2 lần / quá 30 phút | lần 2 và hết hạn → `400 RESET_TOKEN_INVALID` | L, T | A |
| TC-AUTH-020 | Đặt lại mật khẩu | mọi refresh token cũ bị thu hồi | S | A |
| TC-AUTH-021 | Xóa tài khoản sai mật khẩu | `401`, không xóa | L | E |
| TC-AUTH-022 | Sau xóa tài khoản | access token còn hạn → `401`; đăng nhập → `401`; email đăng ký lại được sau khi xóa cứng | S | E |
| TC-AUTH-023 | Rate limit `/auth/*` | request thứ 6/phút/IP → `429` + `Retry-After` | S | E |
| TC-AUTH-024 | Cookie refresh không gửi tới route ngoài `/api/v1/auth` | `Path` đúng | S | E |
| TC-AUTH-025 | 2 request refresh **đồng thời** cùng cookie (tới API) | đúng 1 thành công (`UPDATE … WHERE revoked_at IS NULL`), request còn lại → thu hồi family | D, S | A, I, E |
| TC-AUTH-026 | Phát hiện dùng lại token rồi ném lỗi | thu hồi family **không bị rollback** (fake UnitOfWork mô phỏng rollback) | S | A, E |
| TC-AUTH-027 | 2 access token cùng user trong cùng 1 giây | khác nhau (`jti`) | B | U |
| TC-AUTH-028 | `next=https://evil.test` sau đăng nhập | bị bỏ qua, về `/` (open redirect) | S | C |
| TC-AUTH-029 | Tab thứ 2 refresh bằng cookie vừa xoay vòng (≤ 10 s) | được cấp phiên mới, không đăng xuất; sau 10 s → coi là đánh cắp | D, T | A, E |
| TC-AUTH-030 | Đăng xuất xảy ra đúng lúc refresh đang chạy | không làm sống lại phiên | D, S | A |
| TC-AUTH-031 | Đồng hồ app lệch đồng hồ máy chủ | hạn JWT tính theo `Clock` của app | T | U |
| TC-AUTH-032 | Job xóa cứng (UC-19) | tài khoản đóng đúng 30 ngày → chưa xóa; quá 30 ngày → xóa user, phiên, đồng ý, bé không ai khác chăm; bản ghi trên bé chung còn, không tên người làm; chạy lại không lỗi; job lỗi chỉ ghi log | B, D | U, I |

### 5.3 Hồ sơ bé & danh sách tránh (`child-profile`) — FR-001..013

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-CHD-001 | Tạo hồ sơ đủ 5 bước | `201`, trả tuổi + giai đoạn | N | A, E |
| TC-CHD-002 | Tên: rỗng / chỉ khoảng trắng / 1 / 30 / 31 ký tự | lỗi / lỗi / ok / ok / lỗi | B | U, E |
| TC-CHD-003 | Tên NFD (“Nà” tổ hợp) | lưu NFC, so sánh bằng với NFC | B | U |
| TC-CHD-004 | Tên bắt đầu bằng emoji / chỉ 1 ký tự | chữ viết tắt avatar không vỡ (lấy theo grapheme) | B | U |
| TC-CHD-005 | Chữ viết tắt: “Na” → “Na”, “Minh Anh” → “MA”, “nguyễn thị hoa” → “TH” | đúng quy tắc | N | U |
| TC-CHD-006 | Danh sách dị ứng có phần tử trùng | khử trùng | B | U |
| TC-CHD-007 | Dị ứng không thuộc enum (`"milk"`) | `400` | L | E |
| TC-CHD-008 | `ingredientId` không tồn tại trong catalog | `422 UNKNOWN_INGREDIENT` | L | A |
| TC-CHD-009 | Cùng nguyên liệu vừa `not_eat` vừa `dislike` | giữ 1, ưu tiên `not_eat` | B | U |
| TC-CHD-010 | Danh sách tránh rỗng | hợp lệ | B | A |
| TC-CHD-011 | 200 nguyên liệu tránh (vượt giới hạn 100) | `400` | B | E |
| TC-CHD-012 | Cập nhật danh sách tránh phát `ProfileChanged` 1 lần | handler sinh lại bữa tương lai | N | A |
| TC-CHD-013 | Đọc/sửa/xóa bé của user khác | `404` (không phải `403`) | S | E |
| TC-CHD-014 | `childId` sai định dạng UUID | `400` | L | E |
| TC-CHD-015 | Xóa bé | cascade: bữa, log, phản ứng, tạm dừng, sức khỏe đều mất; user khác không ảnh hưởng | N | I |
| TC-CHD-016 | Tạo bé khi đang < 6 tháng | lưu hồ sơ, `plannable = false`, không sinh thực đơn | B | A |
| TC-ING-001 | Tìm “ca rot” / “CÀ RỐT” / “cà rốt” (NFD) | đều ra “Cà rốt” | B | I |
| TC-ING-002 | Tìm “dau” | ra cả “Đậu phụ”, “Đậu Hà Lan” (đ → d) | B | I |
| TC-ING-003 | `q` rỗng / 1 ký tự / 100 / 101 ký tự | `400` / ok / ok / `400` | B | E |
| TC-ING-004 | `q = "%"`, `"_"`, `"' OR 1=1 --"` | không lỗi, không trả toàn bộ bảng (đã escape) | S | I |
| TC-ING-005 | Kết quả > 20 | cắt còn 20, sắp theo độ khớp | B | I |

### 5.4 Bộ lọc an toàn (`SafetyFilter`) — BR-01..08 (bảng quyết định)

| ID | Dị ứng tránh chứa tag | Nguyên liệu trong avoid | Nguyên liệu paused | Stage hỗ trợ | minAge ≤ tuổi | Từ chối ≤ 30 ngày | Ốm & có nguyên liệu mới | Kết quả | Lý do ghi nhận |
|---|---|---|---|---|---|---|---|---|---|
| TC-SAF-001 | – | – | – | ✔ | ✔ | – | – | **Giữ** | – |
| TC-SAF-002 | ✔ | – | – | ✔ | ✔ | – | – | Loại | `allergen` |
| TC-SAF-003 | – | ✔ | – | ✔ | ✔ | – | – | Loại | `avoid` |
| TC-SAF-004 | – | – | ✔ | ✔ | ✔ | – | – | Loại | `paused` |
| TC-SAF-005 | – | – | – | ✘ | ✔ | – | – | Loại | `age` |
| TC-SAF-006 | – | – | – | ✔ | ✘ | – | – | Loại | `age` |
| TC-SAF-007 | – | – | – | ✔ | ✔ | ✔ | – | Loại | `refused` |
| TC-SAF-008 | – | – | – | ✔ | ✔ | – | ✔ | Loại | `sick_new` |
| TC-SAF-009 | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | Loại | **chỉ** `allergen` (ưu tiên cao nhất; mỗi món đếm 1 lần) |

| ID | Case đặc biệt | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-SAF-010 | Thứ tự ưu tiên lý do: allergen > avoid > paused > age > refused > sick_new | `excluded.total` = số món distinct = tổng `byReason` | B | U |
| TC-SAF-011 | `minAgeMonths = 12`, bé 11 tháng 29 ngày / 12 tháng 0 ngày | loại / giữ | B | U |
| TC-SAF-012 | Từ chối cách 29 / 30 / 31 ngày | loại / loại / giữ | B, T | U |
| TC-SAF-013 | Log mới nhất thích 4 sau lần từ chối | giữ (lần gần nhất quyết định) | B | U |
| TC-SAF-014 | Nguyên liệu đã `resumed` | giữ | N | U |
| TC-SAF-015 | Đang hồi phục + nguyên liệu mới | loại (BR-53) | N | U |
| TC-SAF-016 | Món có 2 nguyên liệu, 1 nguyên liệu nhiều tag dị ứng | loại nếu bất kỳ tag nào nằm trong danh sách tránh | B | U |
| TC-SAF-017 | Dị ứng “Cá” trong khi món là “Cháo tôm” (shellfish) | giữ (không suy luận chéo loại) | B | U |
| TC-SAF-018 | **Property:** với catalog + avoid list ngẫu nhiên, mọi món được giữ không chứa tag/nguyên liệu bị tránh hay paused | luôn đúng (1000 lần chạy) | P | U |
| TC-SAF-019 | `assertSafe` khi ghi (swap/save) với món vi phạm | ném `DISH_NOT_SAFE_FOR_CHILD` | S | U, A |
| TC-SAF-020 | Món `draft` trong production | không bao giờ vào catalog đọc | S | I |

### 5.5 Menu engine (`MenuEngine`) — BR-13..31

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-ENG-001 | GĐ2, kho đủ | 3 bữa chính + 1 phụ, giờ 07:30 / 11:00 / 15:00 / 18:00 | N | U |
| TC-ENG-002 | GĐ1 | 2 bữa chính, 0 bữa phụ | B | U |
| TC-ENG-003 | GĐ4 (3–4 bữa chính, 1–2 phụ) | lấy mức thấp (3 + 1) khi bình thường | B | U |
| TC-ENG-004 | **Catalog rỗng sau lọc** | không tạo bữa; trả `unfilledSlots` kèm lý do; không throw | B | U, A |
| TC-ENG-005 | Chỉ 1 món an toàn | dùng cho 1 slot; slot khác `unfilled` (không vi phạm chống lặp 3 ngày) | B | U |
| TC-ENG-006 | Ứng viên sau chống lặp 7 ngày = 2 | nới xuống 3 ngày, `relaxedWindowDays = 3` | B | U |
| TC-ENG-007 | Ứng viên sau chống lặp 7 ngày = 3 | không nới | B | U |
| TC-ENG-008 | Món dùng đúng 7 ngày trước / 8 ngày trước | bị chống lặp / được dùng | B, T | U |
| TC-ENG-009 | Bữa chính trong ngày khác nguồn đạm khi có thể | không trùng đạm | N | U |
| TC-ENG-010 | Chỉ còn đạm đậu (tránh cá, gà, bò, heo, trứng) | vẫn đủ bữa, tất cả đạm đậu, không lỗi | B | U |
| TC-ENG-011 | Nguyên liệu mới chỉ ở Sáng/Trưa, tối đa 1/ngày | bữa Xế/Tối không có nguyên liệu mới | N | U |
| TC-ENG-012 | Món giới thiệu **2 nguyên liệu mới cùng lúc** | bị loại | B | U |
| TC-ENG-013 | 2 nguyên liệu mới thuộc nhóm dị ứng cách 2 ngày / 3 ngày | lần 2 không được / được (BR-25) | B, T | U |
| TC-ENG-014 | Deterministic: cùng input chạy 2 lần | kết quả giống hệt | P | U |
| TC-ENG-015 | Khác `childId`, cùng input | có thể khác (seed khác) nhưng mỗi kết quả đều hợp lệ | P | U |
| TC-ENG-016 | **Property:** mọi kế hoạch sinh ra thỏa lọc cứng + chống lặp tối thiểu 3 ngày | luôn đúng | P | U |
| TC-ENG-017 | Tuần vắt qua năm (28/12/2026–03/01/2027) | 7 ngày đúng thứ tự, tuần bắt đầu Thứ Hai | T | U |
| TC-ENG-018 | Hôm nay Chủ nhật | `weekStart` = Thứ Hai trước đó | T | U |
| TC-ENG-019 | Hiệu năng 7 ngày × 200 món | ≤ 200 ms sau warm-up — project `perf` riêng (`npm run test:perf`), không chạy kèm coverage; unit chỉ kiểm tra kết quả 28 bữa | B | U |
| TC-ENG-020 | Mã giải thích cho món “Phù hợp nhất” | ≤ 3 mã, đúng tiêu chí đã đạt | N | U |
| TC-NXT-001 | Trước bữa đầu tiên | bữa tiếp theo = Sáng, đếm ngược đúng | N | U |
| TC-NXT-002 | Giữa 2 bữa, bữa trước chưa ghi nhận | bữa tiếp theo = bữa trước (quá giờ) → “đã tới giờ” | B | U |
| TC-NXT-003 | Tất cả đã ghi nhận/bỏ qua | `nextMealId = null` → “Hôm nay đã xong” | B | U, C |
| TC-NXT-004 | Đếm ngược 0 s / 59 s / 60 s / 1 giờ 20 phút | “đã tới giờ” / “còn 1 phút” / “còn 1 phút” / “còn 1 giờ 20 phút” (làm tròn lên phút) | B | U |
| TC-NXT-005 | Bữa `skipped` | không được chọn làm bữa tiếp theo | B | U |
| TC-PLN-001 | 2 request `GET days/:date` đồng thời khi chưa có kế hoạch | chỉ 1 bộ bữa được lưu (unique `child_id,date,slot`), cả 2 trả cùng dữ liệu | D | I, E |
| TC-PLN-002 | Xem ngày trong quá khứ chưa có kế hoạch | **không** sinh, trả rỗng | B | A |
| TC-PLN-003 | Sinh lại tương lai (BR-31) | bữa đã ăn / đã qua / `prepared` giữ nguyên; bữa `swap` còn an toàn giữ nguyên; bữa `swap` không còn an toàn bị thay | N | A |
| TC-PLN-004 | Đánh dấu `prepared` bữa đã ăn | `409 MEAL_ALREADY_LOGGED` | L | A |
| TC-PLN-005 | Đánh dấu `prepared` 2 lần | idempotent | B | A |

### 5.6 Đổi món & thư viện — FR-040..051, BR-27..29

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-SWP-001 | Kịch bản thiết kế S02 | “Cháo thịt bò cải bó xôi” phù hợp nhất + lý do; tóm tắt “Đã loại 6 món: 3 chứa trứng, 2 chưa hợp độ tuổi, 1 bé từng từ chối” — UI kiểm bằng dữ liệu giả (C); con số thật cần catalog ≥ 60 món có món trứng (P7) | N | A, C |
| TC-SWP-002 | “Cần nấu nhanh hơn” khi món hiện tại đã nhanh nhất | `ranked = []`, thông báo không có món nhanh hơn | B | U |
| TC-SWP-003 | “Thiếu nguyên liệu” | không gợi ý món cùng đạm chính | N | U |
| TC-SWP-004 | “Bé không thích” | không gợi ý món cùng đạm chính; ghi tín hiệu, **không** tự thêm vào avoid list | N | A |
| TC-SWP-005 | Lý do không hợp lệ (`reason=abc`) | `400` | L | E |
| TC-SWP-006 | Đổi bữa đã ghi nhận | `409 MEAL_ALREADY_LOGGED` | L | A |
| TC-SWP-007 | Đổi sang chính món hiện tại | `422 SAME_DISH` | B | A |
| TC-SWP-008 | Đổi sang món không an toàn (request tự tạo) | `422 DISH_NOT_SAFE_FOR_CHILD` | S | E |
| TC-SWP-009 | Đổi sang `dishId` không tồn tại | `404` | L | E |
| TC-SWP-010 | Đổi bữa của ngày đã qua | `422 MEAL_IN_PAST` | T | A |
| TC-SWP-011 | 2 lần đổi song song cùng bữa | trạng thái cuối nhất quán, có 2 `swap_events` | D | I |
| TC-SWP-012 | Kho món ít → nới 3 ngày | trả `relaxedWindowDays = 3`, UI hiện ghi chú | B | A, C |
| TC-LIB-001 | Tìm + chip + “Chưa ăn 7 ngày” kết hợp | giao của 3 điều kiện | N | U |
| TC-LIB-002 | Không kết quả | empty state + gợi ý bỏ lọc “Chưa ăn 7 ngày” | B | C |
| TC-LIB-003 | Từ khóa chỉ khớp món đang bị ẩn | 0 kết quả + “1 món khớp từ khóa đang bị ẩn vì …” | B | U, C |
| TC-LIB-004 | Tag ưu tiên khi món vừa “Bé thích” vừa “Ăn 2 ngày trước” | hiển thị cả 2, thứ tự cố định | B | U |
| TC-LIB-005 | Chip không hợp lệ (`chip=xyz`) | `400` | L | E |
| TC-LIB-006 | Gõ có dấu “bò” / “bơ” / không dấu “bo” / “bố” (không món nào) | “bò” chỉ ra món bò, “bơ” chỉ ra bơ; “bo” ra cả hai; “bố” quay về đọc không dấu | B | U, E |
| TC-LIB-007 | Từ đã gõ xong “gà” so với “gạo” (bỏ dấu đều thành “ga…”) | “gà” chỉ ra món gà; “ch” (đang gõ) vẫn ra các món cháo | B | U |
| TC-LIB-008 | Bộ lọc trong URL (`?q=&chip=&fresh=`), deep link, chip lạ trong URL | khôi phục đủ bộ lọc; chip lạ → “Tất cả”; gõ tìm chỉ gửi 1 request sau 150 ms | B | C |
| TC-SWP-013 | Đổi chính bữa đang giới thiệu nguyên liệu dị ứng mới trong ngày | bữa thay thế được phép giới thiệu 1 nguyên liệu dị ứng mới khác | B | U |
| TC-SWP-014 | Ghi `swap_events` thất bại | bữa giữ nguyên món cũ (cùng transaction) | L | U |
| TC-SWP-015 | Đổi bữa đang `prepared` | bữa về `planned` (món mới chưa nấu) | B | U |
| TC-SWP-016 | Đổi món chính ↔ bữa phụ | `422 DISH_NOT_FOR_SLOT` | L | U, E |

### 5.7 Ghi nhận bữa ăn & phản ứng — FR-060..064, BR-40, BR-44

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-LOG-001 | Ghi “Nửa phần”, thích 3, không phản ứng | `201`, bữa `eaten`, nguyên liệu mới → `tried` | N | A, E |
| TC-LOG-002 | “Không ăn” | bữa `refused`, nguyên liệu **không** thành `tried` (BR-44) | B | A |
| TC-LOG-003 | Rating 0 / 1 / 5 / 6 / 2.5 | lỗi / ok / ok / lỗi / lỗi | B | E |
| TC-LOG-004 | Ghi 2 lần cùng bữa | `409 MEAL_ALREADY_LOGGED` | L | A |
| TC-LOG-005 | **Double-submit** 2 POST đồng thời | 1 `201`, 1 `409`; chỉ 1 log trong DB | D | I, E |
| TC-LOG-006 | `loggedAt` tương lai > 5 phút / trước ngày bữa > 1 ngày | `422` | T | A |
| TC-LOG-007 | Phản ứng có severity nhưng 0 triệu chứng | `422` | L | E |
| TC-LOG-008 | Ghi chú 500 / 501 ký tự; chứa `<script>` | ok / `400`; lưu và hiển thị dạng text | B, S | E, C |
| TC-LOG-009 | Phản ứng sau bữa có 1 nguyên liệu mới (rau ngót) | tạm dừng **chỉ** rau ngót | N | A |
| TC-LOG-010 | Phản ứng, bữa không có nguyên liệu mới, có nguyên liệu dị ứng (cá) | tạm dừng cá (BR-40 nhánh 2) | B | A |
| TC-LOG-011 | Phản ứng, bữa không có nguyên liệu mới lẫn dị ứng | không tạm dừng gì; thông báo tương ứng | B | A |
| TC-LOG-012 | Nguyên liệu đã đang tạm dừng | không tạo bản ghi trùng (partial unique) | B | I |
| TC-LOG-013 | **Lỗi giữa transaction** (sinh lại bữa ném lỗi) | rollback: không có log, reaction, paused | L | I |
| TC-LOG-014 | Ghi bữa của user khác | `404` | S | E |
| TC-LOG-015 | Sau tạm dừng, nguyên liệu không xuất hiện ở bữa tương lai / đổi món / thư viện | đúng ở cả 3 nơi | N | E |
| TC-LOG-016 | Chọn “Khó thở” hoặc “Nặng” | FE hiện banner đỏ mở S08 | N | C |
| TC-LOG-017 | Mất mạng khi bấm Lưu | nháp được giữ, báo cần kết nối, không mất dữ liệu đã nhập | L | C |
| TC-LOG-018 | Lưu ghi nhận có phản ứng, bữa tải lại ở trạng thái đã ghi nhận | thông báo “đã lưu” + nguyên liệu vừa tạm dừng vẫn hiển thị | N | C |
| TC-LOG-019 | Bữa đã “chuẩn bị” chứa nguyên liệu vừa bị tạm dừng | bữa được thay (không để món không an toàn) | S | A |

### 5.8 An toàn khẩn cấp & dùng lại — FR-065..068, BR-41..43

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-URG-001 | Mở khẩn cấp từ bữa có cá hồi + rau ngót (lần đầu) | tạm dừng cả 2 (BR-41) | N | A |
| TC-URG-002 | Mở khẩn cấp không có `mealId` | tạo sự kiện, không tạm dừng | B | A |
| TC-URG-003 | Mở khẩn cấp 2 lần liên tiếp | 2 sự kiện, không tạm dừng trùng | B | I |
| TC-URG-007 | Mở khẩn cấp từ bữa chưa tới giờ (bữa bé đang ăn) | bữa đó giữ nguyên món; bữa tương lai khác có nguyên liệu bị tạm dừng được thay | B | A |
| TC-URG-004 | “Đã liên hệ y tế” 2 lần | giữ thời điểm lần đầu | B | A |
| TC-URG-005 | Nút gọi 115 | `href="tel:115"` và số “115” hiển thị dạng text | N | C |
| TC-URG-006 | Màn khẩn cấp khi offline | vẫn hiển thị dấu hiệu + nút gọi (precache) | L | S |
| TC-RES-001 | Dùng lại nguyên liệu đang tạm dừng | `resumed_at` được đặt, bữa tương lai được sinh lại có thể dùng lại | N | A |
| TC-RES-002 | Dùng lại nguyên liệu không tạm dừng | `409 INGREDIENT_NOT_PAUSED` | L | A |
| TC-RES-003 | Dùng lại rồi phản ứng lại | tạo bản ghi tạm dừng mới (partial unique cho phép) | B | I |
| TC-RES-004 | UI xác nhận 2 bước | bấm 1 lần chưa gửi request | N | C |

### 5.9 Sức khỏe — FR-080..084, BR-50..53

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-HLT-001 | Đang ốm, GĐ2 | +1 bữa phụ, khẩu phần ~88 ml → làm tròn 90 ml, kết cấu `lumpy` → `mashed`, không nguyên liệu mới | N | U |
| TC-HLT-002 | **Đang ốm ở GĐ1** (đã là `puree_smooth`) | kết cấu giữ nguyên (không có mức thấp hơn) | B | U |
| TC-HLT-003 | GĐ1 có 0 bữa phụ khi ốm | thành 1 bữa phụ | B | U |
| TC-HLT-004 | Khẩu phần dạng chữ (“2–3 thìa”) | giữ chữ + ghi chú “ít hơn bình thường” (không nhân số) | B | U |
| TC-HLT-005 | Ngày kết thúc < ngày bắt đầu | `422` | L | E |
| TC-HLT-006 | Ngày kết thúc = ngày bắt đầu | hợp lệ | B | U |
| TC-HLT-007 | “Bình thường” kèm biểu hiện | biểu hiện bị bỏ | B | U |
| TC-HLT-008 | Chuyển ốm → hồi phục → bình thường | mỗi lần sinh lại bữa tương lai đúng quy tắc | N | A |
| TC-HLT-009 | Qua ngày dự kiến kết thúc | S01 hiện banner gợi ý chuyển trạng thái | T | C |
| TC-HLT-010 | Cập nhật sức khỏe khi bữa hiện tại đang `prepared` | giữ nguyên bữa `prepared` | B | A |
| TC-HLT-011 | Ngày bắt đầu quá xa trong tương lai (> 7 ngày) | `422` | B | E |

### 5.10 Thực đơn tuần & chỉ số — FR-090..095, BR-60..62

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-WK-001 | Tuần GĐ2 đủ dữ liệu | `totalMeals = 28`, distinct đúng, `daysFullGroups` đúng | N | U |
| TC-WK-002 | Nguồn đạm bị tránh (trứng) | hiển thị 0 + “Đang tránh theo hồ sơ” | N | U, C |
| TC-WK-003 | Nguồn đạm 0 nhưng không bị tránh | hiển thị 0, **không** có ghi chú | B | U |
| TC-WK-004 | Xem tuần đã qua chưa có kế hoạch | không sinh, chỉ số = 0 | B | A |
| TC-WK-005 | Lên tuần sau khi đã có kế hoạch, `overwrite = false` | `409 PLAN_EXISTS`; `true` → chỉ thay bữa chưa ghi nhận | B | A |
| TC-WK-006 | Sinh tuần xa hơn tuần kế tiếp | `422 WEEK_OUT_OF_RANGE` | B | A |
| TC-WK-007 | `weekStart` không phải Thứ Hai | `400` | L | E |
| TC-WK-008 | Đổi món làm thay đổi distinct | chỉ số cập nhật ngay | N | A |

### 5.11 API chung, hạ tầng & dữ liệu

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-API-001 | JSON hỏng | `400` Problem Details (`application/problem+json`) | L | E |
| TC-API-002 | Body > 100 KB | `413` | B | E |
| TC-API-003 | Route không tồn tại | `404` Problem Details | L | E |
| TC-API-004 | DB mất kết nối | `/health` → `503`; route khác `503`, không lộ stack/SQL | L | I, E |
| TC-API-005 | Lỗi không mong đợi | `500` với `type`/`title` chung, log có request id, response không có stack | L | E |
| TC-API-006 | CORS từ origin lạ | không có `Access-Control-Allow-Origin` | S | E |
| TC-API-007 | Header bảo mật | có `Strict-Transport-Security`, `X-Content-Type-Options`, không có `X-Powered-By` | S | E |
| TC-API-008 | Log không chứa mật khẩu/token/ghi chú phản ứng | redact đúng | S | I |
| TC-API-009 | **Truy cập chéo:** với mọi route có `:childId`/`:mealId`, dùng token user B | luôn `404` (test sinh tự động từ danh sách route) | S | E |
| TC-API-010 | Env thiếu/sai (`DATABASE_URL` rỗng, `JWT_SECRET` < 32 ký tự) | app dừng khi khởi động với thông báo rõ | L | U |
| TC-API-011 | Đường dẫn percent-encoding hỏng (`/api/v1/health/%FF`) | `400` Problem Details, không crash | L | E |
| TC-API-012 | Response `202`/`204` không có body | client trả `undefined`, không lỗi parse JSON | B | U |
| TC-DB-001 | Migration trên DB rỗng | thành công, có extension `pg_trgm`, partial index | N | I |
| TC-DB-002 | Seed chạy 2 lần | không nhân bản; tăng `content_version` → cập nhật | B | I |
| TC-DB-003 | CHECK `liking` 0/6, `weeks_early` 17 ở tầng DB | bị từ chối (phòng thủ khi bỏ qua validation) | S | I |
| TC-DB-004 | Catalog lỗi: tham chiếu `ingredientId` sai, món < 12 tháng có muối/đường/nước mắm/mật ong, thiếu biến thể stage | `catalog:validate` fail với thông báo chỉ rõ món | L | U |
| TC-ARC-001 | Domain import `@prisma/client` / `@nestjs/*` | lint fail (boundaries) | S | U |
| TC-ARC-002 | Adapter module A import adapter module B | lint fail | S | U |

### 5.12 Frontend & responsive — NFR-013/014/020

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-UI-001 | Mọi màn hình ở 7 viewport (320×568, 360×800, 375×667, 390×844, 430×932, 844×390, 768×1024) | `scrollWidth ≤ clientWidth` (không cuộn ngang); screenshot khớp baseline | B | S |
| TC-UI-002 | 320 px: lưới 3 nút (Đổi món / Bé đã ăn / Phản ứng), 5 tab bottom nav, 6 nút lượng ăn | không tràn, chữ xuống dòng hoặc rút gọn, vùng chạm ≥ 44 px | B | S |
| TC-UI-003 | Landscape 844×390 | nội dung cuộn được, bottom nav không che nút chính | B | S |
| TC-UI-004 | Bàn phím ảo mở (ô ghi chú S07, ô tìm S05/S06) | nút “Lưu”/“Tiếp tục” vẫn thấy được (dùng `visualViewport`/`dvh`) | B | S |
| TC-UI-005 | Thiết bị có tai thỏ | header và bottom nav có padding `env(safe-area-inset-*)` | B | C, S |
| TC-UI-006 | Ô nhập | `font-size ≥ 16px` (iOS không tự zoom) | B | C |
| TC-UI-007 | Zoom 200% ở 320 px | không mất nội dung/chức năng, không cuộn ngang | B | S |
| TC-UI-008 | > 480 px | khung mobile rộng tối đa 480 px ở giữa | B | S |
| TC-UI-009 | Tên món 60 ký tự, số đếm 99+ | xuống dòng, không vỡ layout | B | C |
| TC-UI-010 | Bàn phím: Tab qua mọi control, `ToggleChip` bật bằng Space/Enter, `SegmentedTabs` bằng mũi tên | đúng, focus nhìn thấy được | N | C |
| TC-UI-011 | axe-core mọi route | 0 lỗi mức serious/critical | N | S |
| TC-UI-012 | `prefers-reduced-motion` | tắt hiệu ứng chuyển động | B | C |
| TC-UI-013 | Mỗi query: loading / lỗi / rỗng / có dữ liệu | đủ 4 trạng thái, nút Thử lại hoạt động | B | C |
| TC-UI-014 | 401 giữa lúc điền form → refresh thành công | request được gửi lại tự động, không mất dữ liệu | L | C |
| TC-UI-015 | Refresh thất bại | chuyển `/login`, giữ nháp onboarding/log, quay lại đúng trang sau đăng nhập | L | C |
| TC-UI-016 | Double-tap nút gửi | chỉ 1 request (nút disabled khi pending) | D | C |
| TC-UI-017 | Deep link `/meals/<id không tồn tại>/log` | trang “Không tìm thấy” có nút về Hôm nay | L | C |
| TC-UI-018 | Nút Quay lại trong onboarding | giữ dữ liệu các bước đã nhập | N | C |
| TC-UI-019 | Offline | banner “Mất kết nối”; xem được thực đơn hôm nay đã cache; nút ghi bị khóa kèm lý do | L | S |
| TC-UI-020 | `StrictMode` chạy effect khôi phục phiên 2 lần | chỉ 1 request `/auth/refresh` (single-flight), không bị đăng xuất | D | C |
| TC-UI-021 | Xóa hồ sơ bé khi đang ở trang dùng hồ sơ | không crash, chuyển sang onboarding | L | C |
| TC-UI-022 | Response xem trước chậm (S10) | hiện “Đang cập nhật…”, không để dữ liệu cũ im lặng | B | C |
| TC-UI-023 | Mở S01 lúc 23:59 giờ VN, qua 0 giờ | tự chuyển sang ngày mới (tiêu đề + tải thực đơn ngày mới), không cần tải lại trang; ngày tính theo giờ VN, không theo thiết bị/UTC | T | C |
| TC-UI-024 | “Đã chuẩn bị xong” bị từ chối (bữa đã ghi ở máy khác, 409) | card đổi ngay rồi hoàn tác, báo lỗi tiếng Việt, tải lại thực đơn ngày | L | C |
| TC-UI-025 | Link tới màn của phase sau (Đổi món, Bé đã ăn, Sức khỏe) | mở màn tạm có nút Quay lại, không rơi vào “Không tìm thấy” | B | C |
| TC-UI-026 | Ngày có slot không tìm được món an toàn / bé ngoài 6–24 tháng | hiện slot “Chưa có món phù hợp” + link sửa thực phẩm cần tránh / thông báo độ tuổi, **không** gọi API lập thực đơn | B | C |
| TC-UI-027 | Mở lại app khi mất mạng (đã xem trong 24 h) | phiên `offline`, hiện thực đơn hôm nay + công thức đã mở từ cache trên máy, banner “cần kết nối”; có mạng lại → kiểm phiên, bỏ banner; cache không chứa tài khoản, link mời, email thành viên, nhật ký; đăng xuất / hết phiên → xóa cache | E, S | C |
| TC-UI-028 | Tải lại trang ngay sau khi tạo hồ sơ (cache trên máy còn danh sách bé rỗng) | ở lại màn đang mở, không bị đẩy qua onboarding rồi về Hôm nay | D | C |

---

### 5.12b Món của bạn — FR-130..137, BR-80..87 (P5)

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-CUS-001 | Tạo món chính gạo + gà + bí đỏ, không định lượng | `201`, `custom: true`, nguyên liệu chính = gà, nguồn đạm = gà, nhóm chất đạm / tinh bột / rau | N | U, A, E |
| TC-CUS-002 | Bé tránh trứng → tạo món có trứng; có nguyên liệu đang tạm dừng; có mật ong cho bé 8 tháng | `422 DISH_NOT_SAFE_FOR_CHILD`, `ingredients` = [{Trứng, allergen}] / [{…, paused}] / [{Mật ong, age}]; không lưu gì | S | U, A |
| TC-CUS-003 | Tên 1 / 2 / 60 / 61 ký tự, chỉ khoảng trắng, NFD, emoji, `<script>` | lỗi / ok / ok / lỗi / lỗi / chuẩn hóa NFC / ok / lưu & hiển thị như text | B, S | U, E, C |
| TC-CUS-004 | Tên trùng món của bạn khác (khác hoa thường / dấu: “Cháo gà” vs “chao ga”) | `409 DISH_NAME_TAKEN`; trùng tên món catalog hoặc món của bé khác → cho phép | B | U, A |
| TC-CUS-005 | 0 / 1 / 15 / 16 nguyên liệu; nguyên liệu trùng; id không có trong danh mục | lỗi / ok / ok / lỗi / khử trùng / `422 UNKNOWN_INGREDIENT` | B, L | U, E |
| TC-CUS-006 | Định lượng 0 / 0.5 / 9 999 / 10 000 / âm; đơn vị 12 / 13 ký tự | lỗi / ok / ok / lỗi / lỗi; ok / lỗi | B | E |
| TC-CUS-007 | Sơ chế 0 + nấu 0; 180 / 181; nấu 240 / 241; 15 / 16 bước; bước 300 / 301 ký tự | lỗi; ok / lỗi; ok / lỗi; ok / lỗi; ok / lỗi | B | U, E |
| TC-CUS-008 | Món thứ 50 / 51 (món đã xóa không tính) | ok / `422 CUSTOM_DISH_LIMIT_REACHED` | B | A |
| TC-CUS-009 | Món của bạn trong thư viện, chip “Món của bạn”, gợi ý đổi món, thực đơn tự động | xuất hiện cùng quy tắc; chip chỉ trả món của bạn | N | U, A, E |
| TC-CUS-010 | Món của bé A với bé B / người dùng khác (xem, sửa, xóa, đổi món sang, công thức) | `404` | S | E |
| TC-CUS-011 | Sửa món thêm nguyên liệu bé chưa ăn → bữa tương lai đang dùng món | `newIngredients` của bữa cập nhật; sửa làm món vi phạm → bị từ chối | N | A |
| TC-CUS-012 | Hồ sơ đổi (thêm tránh gà) sau khi tạo món gà | món vào khối “Đang ẩn”, bữa tương lai dùng món được sinh lại | B | A |
| TC-CUS-013 | Xóa món đang có ở bữa tương lai và bữa đã ăn | bữa tương lai đổi món khác; bữa đã ăn, nhật ký vẫn hiện tên món; không còn trong thư viện / gợi ý | N | A, E |
| TC-CUS-014 | Xóa món 2 lần; sửa món đã xóa | `404` | L | A |
| TC-CUS-015 | Seed lại catalog sau khi có món của bạn | món của bạn còn nguyên; API catalog không trả món của bạn | B | I |
| TC-CUS-016 | Công thức món của bạn | nhãn “Món của bạn · chưa qua chuyên gia duyệt”, lưu ý theo tuổi, không có “Công thức vN” | N | C |
| TC-CUS-017 | G15: thêm nguyên liệu → nhóm chất cập nhật; lỗi lọc cứng chỉ rõ nguyên liệu; rời trang rồi quay lại | đúng; nháp còn nguyên | N | C |

### 5.13 Nhiều người chăm — FR-110..120, BR-70..79 (P5b)

| ID | Kịch bản | Kết quả mong đợi | Loại | Tầng |
|---|---|---|---|---|
| TC-FAM-001 | Mẹ mời → ba mở link khi đã đăng nhập → Tham gia | ba là người chăm, `GET /children` của ba có bé với `role = caregiver`, thấy đúng thực đơn hôm nay | N | A, E |
| TC-FAM-002 | Mở link khi chưa có tài khoản → đăng ký → onboarding bị bỏ qua | quay lại màn lời mời với token còn nguyên, Tham gia xong vào S01 của bé | N | C, S |
| TC-FAM-003 | Xem trước lời mời không đăng nhập | chỉ trả `childName`, `inviterName`, `expiresAt` — không lộ ngày sinh, dị ứng, email | S | E |
| TC-FAM-004 | Lời mời ở giây 72 giờ − 1 / đúng 72 giờ / + 1 | còn hiệu lực / hết hạn (`410 INVITE_EXPIRED`) / hết hạn | B, T | U, A |
| TC-FAM-005 | Dùng lời mời lần 2 (người khác) | `409 INVITE_USED`, không thêm thành viên | L | A |
| TC-FAM-006 | Lời mời đã thu hồi / token sai / token đúng độ dài nhưng không tồn tại | `410 INVITE_REVOKED` / `404 INVITE_NOT_FOUND` / `404`; thời gian phản hồi không phân biệt được token gần đúng | L, S | A, E |
| TC-FAM-007 | 2 người bấm Tham gia cùng 1 lời mời đồng thời | đúng 1 người thành thành viên, người còn lại `409 INVITE_USED` | D | I, E |
| TC-FAM-008 | Chủ mở link của chính mình; thành viên mở lại link khác của cùng bé | `409 ALREADY_MEMBER`, FE mở luôn hồ sơ bé | B | A, C |
| TC-FAM-009 | Bé đủ 6 thành viên → tạo lời mời; còn 5 → nhận lời mời khi đã có 5 lời mời chờ | `422 MEMBER_LIMIT_REACHED`; nhận lời mời làm đủ 6 thì lời mời khác bị từ chối khi nhận | B | U, A |
| TC-FAM-010 | 5 lời mời đang chờ → tạo thứ 6; thu hồi 1 → tạo lại | `422 INVITE_LIMIT_REACHED`; sau thu hồi tạo được | B | A |
| TC-FAM-011 | **Ma trận truy cập**: mọi route có `:childId` / `:mealId` × chủ / người chăm / người ngoài | đúng 2xx / `403 OWNER_ONLY` / `404` theo BR-73; route mới chưa khai báo quyền → test fail | S | E |
| TC-FAM-012 | Người chăm sửa danh sách tránh, đổi giai đoạn, dùng lại nguyên liệu, xóa bé, mời người khác | `403 OWNER_ONLY`, dữ liệu không đổi | S | A, E |
| TC-FAM-013 | Người chăm ghi nhận bữa có phản ứng | ghi được, nguyên liệu bị tạm dừng như khi chủ ghi (BR-40), `actor_id` = người chăm | N | A, I |
| TC-FAM-014 | Chủ gỡ người chăm trong khi người chăm đang mở S01 (access token còn hạn) | request kế tiếp của người chăm → `404`; FE chuyển sang bé khác hoặc onboarding, báo “Bạn không còn quyền xem hồ sơ này” | S | E, C |
| TC-FAM-015 | Người chăm rời hồ sơ; chủ thử rời | người chăm mất quyền ngay; chủ → `422 OWNER_CANNOT_LEAVE` | N, L | A |
| TC-FAM-016 | Chuyển quyền chủ cho người chăm / cho người ngoài / cho chính mình | đổi vai trò 2 người trong 1 transaction (luôn đúng 1 chủ); `422 NOT_A_CAREGIVER`; `422` | N, L | U, I |
| TC-FAM-017 | Chèn thẳng dòng `owner` thứ 2 cho cùng bé ở DB | vi phạm partial unique index | S | I |
| TC-FAM-018 | Chủ xóa tài khoản khi bé còn người chăm, chưa chọn chuyển quyền / xóa | bị chặn, liệt kê hồ sơ cần xử lý; chọn chuyển quyền → người chăm thành chủ, hồ sơ còn nguyên | N, L | A, E |
| TC-FAM-019 | Người chăm xóa tài khoản | chỉ mất tư cách thành viên; ghi nhận cũ hiển thị “Người dùng đã xóa” (`actor_id` = null) | B | I, A |
| TC-FAM-020 | Ba và mẹ cùng ghi nhận 1 bữa đồng thời | 1 ghi nhận; người sau `409 MEAL_ALREADY_LOGGED` kèm `loggedBy`, `loggedAt` | D | I, E |
| TC-FAM-021 | Mẹ mở S02 → ba đổi món bữa đó → mẹ chọn món | `409 MEAL_CHANGED`, FE báo “Ba vừa đổi bữa này” và tải lại gợi ý | D | A, C |
| TC-FAM-022 | Migration: DB có 3 bé của 2 user | sau migration đúng 3 dòng `owner`, user cũ vẫn thấy đúng bé của mình, không thấy bé người khác | N | I |
| TC-FAM-023 | Người dùng thuộc 2 bé → chọn bé B → tải lại trang | vẫn ở bé B; bị gỡ khỏi bé B → rơi về bé A | N, B | C |
| TC-FAM-024 | S01 của mẹ khi ba vừa ghi nhận | hiển thị “Ba · 11:40” sau khi quay lại tab hoặc ≤ 60 giây | N | C |
| TC-FAM-025 | Tên hiển thị: rỗng, 30 / 31 ký tự, chỉ khoảng trắng, emoji, `<script>` | rỗng → dùng phần trước `@` của email; 31 → `400`; lưu và hiển thị như text thuần | B, S | A, C |
| TC-FAM-026 | Token lời mời trong log server | không xuất hiện: bộ serializer request thay token trong `url` và bỏ `params` | S | U |
| TC-FAM-027 | Gọi `GET /invites/:token` quá giới hạn | `429` như `/auth/*` | S | E |
| TC-FAM-028 | UI người chăm | không thấy nút sửa hồ sơ, sửa danh sách tránh, dùng lại nguyên liệu, xóa bé, mời; server từ chối `403` thì vẫn báo lỗi đúng | N, S | C |
| TC-FAM-029 | Chủ đóng tài khoản khi còn link mời chưa dùng | link chuyển sang đã thu hồi (`410 INVITE_REVOKED`); link đã dùng giữ nguyên | S | U, I |
| TC-FAM-030 | Id bé của mình + đối tượng của gia đình khác (món tự tạo: xem/công thức/sửa/xóa/đổi sang; nguyên liệu tạm dừng: dùng lại) | `404 DISH_NOT_FOUND` / `409 INGREDIENT_NOT_PAUSED` / `404 CHILD_NOT_FOUND`; dữ liệu gia đình kia không đổi (NFR-017) | S | E |

## 6. Truy vết

- Mỗi test đặt tên bắt đầu bằng mã TC (VD `it('TC-SAF-009 món vi phạm nhiều quy tắc chỉ đếm lý do allergen', …)`); script `test:trace` liệt kê TC trong tài liệu chưa có test tương ứng → CI cảnh báo từ P3, fail từ P7.
- Mỗi phase trong kế hoạch chỉ được coi là xong khi toàn bộ TC thuộc phạm vi phase có test xanh.

| Phase | Nhóm TC |
|---|---|
| P0 ✅ | TC-API-001..007, TC-API-010, TC-ARC-001..002, TC-UI-001 (khung) |
| P1 ✅ | TC-AUTH-*, TC-DB-001..004, TC-ING-*, TC-API-011..012, TC-UI-005..006, TC-UI-010, TC-UI-013..017, TC-UI-019 (thông báo mất mạng), TC-UI-020 |
| P2 ✅ | TC-AGE-*, TC-STG-*, TC-CHD-*, TC-AUTH-025/029, TC-UI-018 |
| P3 ✅ | TC-SAF-*, TC-ENG-*, TC-NXT-*, TC-PLN-*, TC-UI-012 (S03), TC-UI-016 (S01), TC-UI-023..026 |
| P4 ✅ | TC-SWP-*, TC-LIB-* (TC-SWP-001 phần số liệu thật chờ catalog P7) |
| P5 ✅ | TC-LOG-*, TC-URG-*, TC-RES-*, TC-CUS-* (TC-URG-006 offline cần PWA — P7) |
| P5b ✅ | TC-FAM-* (TC-FAM-011 tự kiểm mọi route mới trong `openapi.json` ở các phase sau) |
| P6 ✅ | TC-HLT-*, TC-WK-* (TC-HLT-008 chạy ở tầng A với dữ liệu thật; TC-WK-004/005/006/007/008 ở tầng A) |
| P7 🚧 | TC-UI-027/028, TC-FAM-029/030, TC-AUTH-032; Playwright 5 luồng (Chromium + WebKit) + 16 màn × 7 viewport + axe ✅. Còn: screenshot so sánh, mutation testing, thiết bị thật |
