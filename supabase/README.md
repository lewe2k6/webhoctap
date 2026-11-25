# Backend học tập

Áp dụng migration bằng `supabase db push` sau khi liên kết CLI với dự án Supabase. Bật GitHub trong mục Auth Providers. Đặt Site URL và URL chuyển hướng được phép thành địa chỉ GitHub Pages của dự án, ví dụ `https://ten-github.github.io/webhoctap/`. GitHub OAuth App dùng callback do Supabase cung cấp.

Thêm ID số GitHub của chủ tài khoản trong Supabase SQL Editor. ID số được GitHub cấp cố định và có thể lấy ở API `https://api.github.com/users/TEN_GITHUB`.

```sql
insert into tmu_private.github_owners (github_id)
values ('12345678')
on conflict do nothing;
```

Sau lần đăng nhập đầu tiên của chủ tài khoản, có thể tắt tạo người dùng mới trong Supabase Auth. Danh mục, bộ câu hỏi, tiến độ, liên kết PDF và Gemini đều kiểm tra quyền theo danh sách trên.

## Kho PDF và hàm máy chủ

- Dùng bucket R2 riêng và nhập tài liệu qua công cụ chuẩn bị học liệu. Các đối tượng PDF lưu với `Content-Type: application/pdf` và `Cache-Control: private, no-store`.
- Cho phép origin của GitHub Pages trong CORS của R2, ví dụ `https://ten-github.github.io`. Bổ sung `http://localhost:5173` khi thử ở máy phát triển. Cho phép `GET`, header `Range` và hiển thị `Accept-Ranges`, `Content-Length`, `Content-Range`, `Content-Encoding` cho trình đọc PDF.
- Dùng một cặp khóa R2 chỉ đọc cho bucket này để cấp liên kết. Liên kết được giữ trong bộ nhớ của trình đọc và hết hạn sau 30 phút. Thu hồi ngay quyền truy cập của một liên kết đã cấp bằng cách xóa đối tượng tương ứng ở R2. Hủy cấu hình một mã tài liệu trong bảng `study_documents` sẽ dừng cấp liên kết mới.
- Tạo tệp bí mật cục bộ theo [mẫu](functions/.env.example). Đặt `SITE_ORIGINS` là danh sách origin cách nhau bằng dấu phẩy. Supabase cung cấp sẵn `SUPABASE_URL` và `SUPABASE_ANON_KEY` cho Edge Functions. `GEMINI_API_KEY` bật góp ý Gemini cho bài đã nộp. Đặt `GEMINI_MODEL` nếu dự án dùng model khác giá trị mặc định.

```powershell
supabase secrets set --env-file supabase/functions/.env.local
supabase functions deploy pdf-url
supabase functions deploy tutor-feedback
```

Danh mục, câu hỏi và PDF được nhập riêng từ bản dựng Pages. Định nghĩa bảng và chính sách nằm trong [migration](migrations/20261125000100_study.sql).

## Kiểm tra

Chạy [verify.sql](tests/verify.sql) bằng `psql -v ON_ERROR_STOP=1 -f supabase/tests/verify.sql` trên database thử nghiệm trống đã chạy migration. Kiểm tra quyền của chủ tài khoản, quyền đọc tài liệu, nộp bài, gửi lại bản lưu, xung đột giữa thiết bị và giới hạn góp ý.

- [GitHub Auth trên Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- [CORS cho kho Cloudflare R2](https://developers.cloudflare.com/r2/buckets/cors/)
- [Gemini Interactions API](https://aistudio.google.com/docs/interactions-overview)
