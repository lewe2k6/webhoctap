# Ôn tập Kinh tế TMU

Website cá nhân để đọc tài liệu, luyện trắc nghiệm và tự luận, thi thử 30 phút và ôn lại câu sai. Giao diện chạy trên GitHub Pages. Supabase quản lý đăng nhập, bộ câu hỏi, bài làm và tiến độ. Cloudflare R2 lưu các PDF được phép dùng trong kho riêng.

## Chạy trên máy

Cần Node.js 22.12 trở lên và Python 3.11 trở lên cho công cụ học liệu.

```powershell
npm ci
python -m pip install -r tools/requirements.txt
$source = Join-Path $env:USERPROFILE 'Downloads\tmudrm\Nganh_Kinh_Te_TMU'
python tools/library.py scan --source $source
.\scripts\start-library.ps1
```

Mở URL localhost hiện ở terminal. Chế độ này đọc trực tiếp danh mục, bộ câu hỏi trong `.private/packs/` và PDF gốc trên máy. Tiến độ xem thử lưu trong trình duyệt. `npm run dev` mở bản xem thử bằng dữ liệu mẫu khi chưa cấu hình Supabase.

## Cài đặt website trực tuyến

1. Tạo một dự án Supabase và áp dụng các migration trong `supabase/`. Bật GitHub Auth, đặt callback theo Supabase và thêm URL GitHub Pages vào Redirect URLs. Thêm GitHub ID của tài khoản học vào danh sách được phép. Xem [hướng dẫn backend](supabase/README.md).
2. Tạo bucket Cloudflare R2 riêng. Cấu hình CORS với origin của GitHub Pages và bật đọc theo byte range. Ghi lại căn cứ sử dụng PDF trong manifest quyền lưu. Tải các tệp được duyệt bằng công cụ [nhập học liệu](tools/README.md). Học liệu còn lại hiển thị liên kết TMU.
3. Chuẩn bị .private/seed.sql từ danh mục, 37 bộ câu hỏi và kết quả đối chiếu kho PDF, sau đó chạy bằng Supabase CLI hoặc psql. Dùng kết nối quản trị an toàn của dự án. Chạy migration trước seed.

   ```powershell
   python tools/library.py seed-sql --packs .private/packs --full
   supabase link --project-ref PROJECT_REF
   supabase db push
   supabase db query --remote --file .private/seed.sql
   ```

   Sau khi đã tải PDF, tạo lại seed với `--rights .private/approved-pdfs.json` và thông tin kết nối R2 để đăng ký các tệp đã có trong kho.

4. Đặt `SITE_ORIGINS`, thông tin R2 chỉ đọc và `GEMINI_API_KEY` tùy chọn trong Supabase Edge Function secrets. Triển khai `pdf-url` và `tutor-feedback`. Supabase kiểm tra cùng một quyền chủ tài khoản cho cả hai.
5. Trong GitHub, đặt biến repo `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`, rồi vào **Settings → Pages → GitHub Actions**. Workflow `Publish study app` dựng ứng dụng khi đẩy lên `main` hoặc khi chạy thủ công. Bản dựng nhận khóa publishable, còn khóa Gemini và R2 nằm trong secrets phía máy chủ.

## Soạn và kiểm tra bộ câu hỏi

Bộ học liệu riêng gồm 46 học phần. 37 bộ có 15 câu trắc nghiệm và 5 câu tự luận mỗi môn. Mục trắc nghiệm, tình huống và dàn ý là bài luyện biên soạn theo chủ đề từ tài liệu. Một số PDF chỉ có đề cương, nên trang nguồn ở các câu đó dùng để tham chiếu chủ đề.

Các gói câu hỏi được tạo trên máy trong `.private/packs/` với báo cáo dẫn nguồn `.private/question-evidence.md`. Các tệp `question-topics*.tsv` trong cùng thư mục lưu ghi chú chủ đề, phương án áp dụng và tiêu chí. Có thể tạo lại dữ liệu sau khi thay đổi ghi chú.

```powershell
$source = Join-Path $env:USERPROFILE 'Downloads\tmudrm\Nganh_Kinh_Te_TMU'
python scripts/read-source-pages.py --source $source
$topicFiles = Get-ChildItem -Path .private/question-topics*.tsv
python scripts/build-packs.py --full $topicFiles.FullName
python tools/library.py seed-sql --packs .private/packs --full
npm run build
```

Khi sao lưu, giữ thư mục học liệu riêng và dữ liệu Supabase bao gồm bài làm. GitHub lưu mã website. Để kiểm tra luồng thực, thử tắt máy ở nhà, mở website trên 4G/5G và mở một trang PDF lớn. Làm nháp trên một thiết bị rồi đăng nhập thiết bị còn lại. Tải một bộ bài luyện trước khi ngắt mạng để kiểm tra lưu nháp và đồng bộ lại.
