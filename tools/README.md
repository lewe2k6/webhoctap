# Chuẩn bị học liệu riêng

Các lệnh bên dưới chạy tại thư mục dự án với Python 3.11 trở lên. Đường dẫn `--source` trỏ đến thư mục chứa `courses.json`, `bitstreams-cache.json` và các thư mục học phần.

```powershell
python -m pip install -r tools/requirements.txt
$source = Join-Path $env:USERPROFILE 'Downloads\tmudrm\Nganh_Kinh_Te_TMU'
python tools/library.py scan --source $source
```

Lệnh quét đối chiếu 152 PDF với metadata TMU, gộp 3 cặp trùng byte và 5 cặp có nội dung giảng đã đối chiếu, tạo 144 nội dung cho 46 học phần. Các liên kết gốc và số trang PDF đều được lưu. Một PDF thay đổi SHA-256 được xét lại như bản riêng. Đọc `.private/catalog-audit.json` để kiểm tra số lượng và `.private/source-index.json` để tra SHA-256 của bản dùng trong trình đọc.

## Đưa PDF đã duyệt vào kho riêng

Sao chép [tệp mẫu](approved-pdfs.example.json) thành `.private/approved-pdfs.json`. Thêm một mục có `sha256` và `basis` cho mỗi PDF được phép lưu kho riêng. Dùng SHA-256 của bản chuẩn trong `readerFiles` ở `.private/source-index.json`, cùng ghi chú căn cứ cho phép lưu bản đó. Tài liệu chỉ có liên kết hoặc chưa được duyệt sẽ mở nguồn TMU.

```powershell
python tools/library.py r2-upload --rights .private/approved-pdfs.json --dry-run
```

Đặt `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` và `R2_SECRET_ACCESS_KEY` trong phiên terminal để dùng bucket mặc định của tài khoản. Cấp một cặp khóa **Object Read & Write** chỉ cho bucket riêng khi tải lên. Hàm ký URL của Supabase dùng cặp khóa **Object Read only** cho cùng bucket. [Khóa S3 trên R2](https://developers.cloudflare.com/r2/api/tokens/)

```powershell
python tools/library.py r2-upload --rights .private/approved-pdfs.json
```

Lệnh kiểm SHA-256 trên máy và kiểm tra tệp trên R2 theo khóa `pdf/<sha256>.pdf`. Lần chạy lại dùng lại đối tượng đã xác minh. Backend [hướng dẫn cấu hình CORS](../supabase/README.md) để PDF.js đọc từng phần qua mạng di động.

## Nạp danh mục và câu hỏi vào Supabase

Tạo SQL sau khi chuẩn bị thư mục JSON gồm một bộ câu hỏi cho mỗi môn. `--full` kiểm đủ các học phần có PDF, mỗi bộ 15 trắc nghiệm và 5 tự luận. Lệnh cũng kiểm chủ đề, phương án đúng, tiêu chí tự luận và liên kết tới số trang PDF hợp lệ trong môn. Với bản thử hai môn, có thể bỏ `--full`.

```powershell
python tools/library.py seed-sql --packs .private/packs --full
```

Thêm `--rights .private/approved-pdfs.json` để kiểm lại các đối tượng trên R2 và nhập danh sách PDF đang được phép mở. Khi có cờ này, danh sách trong tệp duyệt là danh sách đầy đủ. Một mục bị bỏ khỏi tệp sẽ ngừng cấp link mới sau khi chạy SQL. Khi bỏ cờ này, danh sách PDF đã nhập vẫn được giữ. Các đối tượng R2 được quản lý riêng trong bucket.

Sau khi [liên kết dự án và áp dụng migration](../supabase/README.md), dùng Supabase CLI để nhập dữ liệu. Kiểm tra tên dự án đích khi CLI yêu cầu xác nhận. [Supabase CLI db query](https://supabase.com/docs/reference/cli/supabase-db-query)

```powershell
supabase db query --remote --file .private/seed.sql
```

Tệp SQL thêm hoặc cập nhật học liệu trong một giao dịch và giữ lịch sử bài làm. Giữ dữ liệu `.private/`, khóa và PDF ở máy hoặc dịch vụ riêng đã cấu hình.
