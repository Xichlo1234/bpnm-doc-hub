# Phát hành APK Android của Doc Hub

Mỗi APK mở PWA của một đơn vị bằng Trusted Web Activity. Chrome xác minh quan hệ giữa package Android, chứng thư ký và tên miền qua Digital Asset Links. Người dùng có thể cài từ trang `/install` trên Android 7 (API 24) trở lên.

| Tenant | Tên trên điện thoại | Package | Thư mục bản phát hành |
| --- | --- | --- | --- |
| document-manage | SGII Doc Hub | `vn.tungcv.documentmanage` | `android/document-manage/` |
| bpnm | BPNM Doc Hub | `vn.tungcv.bpnm` | `android/bpnm/` |

## Khóa ký và sao lưu

Mỗi đơn vị có một khóa RSA riêng. Khi bàn giao hoặc thay khóa của một đơn vị, chứng thư và chuỗi cập nhật của đơn vị kia vẫn độc lập. Trên máy phát hành, sao lưu cả bốn tệp trong `C:\Users\DELL\.android-keys\doc-hub\` vào kho dự phòng mã hóa do chủ hệ thống quản lý.

| Tenant | Keystore PKCS12 | Tệp mật khẩu |
| --- | --- | --- |
| document-manage | `document-manage.p12` | `document-manage.password` |
| bpnm | `bpnm.p12` | `bpnm.password` |

Alias là `release`. Khóa và keystore PKCS12 dùng cùng mật khẩu. GitHub chỉ cho ghi lại giá trị của Actions Secrets. Để khôi phục khóa phục vụ các lần cập nhật ứng dụng đã cài, cần bản sao lưu của chủ hệ thống.

## Build và ký ở máy cục bộ

1. Cài Node.js theo `engines` của repo và JDK 21. Đặt `JAVA_HOME` tới thư mục JDK và `ANDROID_HOME` tới Android SDK.
2. Cài Android SDK Command-line Tools rồi chạy `sdkmanager "platforms;android-36" "build-tools;35.0.0" "build-tools;36.0.0" "platform-tools"`. Kiểm tra và chấp thuận giấy phép bằng `sdkmanager --licenses`. Trên Windows, `sdkmanager.bat` ở `%ANDROID_HOME%\cmdline-tools\latest\bin`.
3. Từ gốc repo, chạy `npm ci --prefix scripts/android` để cài Bubblewrap CLI 1.28.0 theo lockfile riêng. Máy build cần truy cập manifest, icon HTTPS của tenant và kho phụ thuộc Gradle, Google Maven, Maven Central.
4. Đặt biến `APK_KEY_DIR` nếu dùng thư mục khóa khác thư mục mặc định `~/.android-keys/doc-hub`. Chạy `npm run apk:build -- document-manage` hoặc `npm run apk:build -- bpnm`.
5. Script sinh dự án Android tạm bằng `bubblewrap update --skipVersionUpgrade`, chạy Gradle wrapper của Bubblewrap, ký bằng `apksigner` rồi kiểm tra chứng thư, package và phiên bản. Tệp đích là `android/<tenant>/<tenant>.apk` và `release.json`. Trường `sha256` là checksum của toàn bộ APK. Trường `certificate` là fingerprint SHA-256 của chứng thư dùng cho Digital Asset Links.

## Build thủ công bằng GitHub Actions

Trong Actions, chọn **Đóng gói APK Android → Run workflow**, chọn nhánh phát hành tin cậy và tenant. GitHub yêu cầu tệp workflow xuất hiện trên nhánh mặc định để kích hoạt `workflow_dispatch`. Nếu repo dùng nhánh mặc định khác nhánh phát hành, đưa workflow lên nhánh mặc định theo quy trình PR trước lần chạy đầu tiên.

Workflow lấy bốn secret có hậu tố tương ứng, khôi phục keystore vào `RUNNER_TEMP`, xóa tệp khóa và mật khẩu khi kết thúc, rồi tải APK cùng `release.json` lên artifact. Để cập nhật secret từ bản sao lưu, dùng `node scripts/android/set-secrets.mjs <tenant>` trên máy tin cậy đã đăng nhập `gh` với quyền quản lý Actions Secrets của repo. Script chuyển giá trị qua stdin.

| Dữ liệu | Document Manage | BPNM |
| --- | --- | --- |
| Keystore dạng Base64 | `ANDROID_KEYSTORE_BASE64_DOCUMENT_MANAGE` | `ANDROID_KEYSTORE_BASE64_BPNM` |
| Mật khẩu keystore | `ANDROID_KEYSTORE_PASSWORD_DOCUMENT_MANAGE` | `ANDROID_KEYSTORE_PASSWORD_BPNM` |
| Alias | `ANDROID_KEY_ALIAS_DOCUMENT_MANAGE` | `ANDROID_KEY_ALIAS_BPNM` |
| Mật khẩu khóa | `ANDROID_KEY_PASSWORD_DOCUMENT_MANAGE` | `ANDROID_KEY_PASSWORD_BPNM` |

## Phát hành bản mới

1. Tăng `appVersionCode` trong `android/<tenant>/twa-manifest.json` và đặt `appVersion` cho người dùng. Giữ package và khóa ký của ứng dụng đã cài.
2. Build lại đúng tenant. Nếu dùng Actions, lấy hai tệp từ artifact và đặt vào thư mục bản phát hành của tenant. Mở PR có manifest, APK và `release.json` đồng bộ. Kích thước khoảng 1,5 MB mỗi APK nằm dưới giới hạn 25 MiB mỗi tệp Workers Static Assets. Repo giữ một binary hiện hành cho mỗi đơn vị để mã web, file APK và fingerprint được phát hành cùng commit. Các phiên bản cũ vẫn chiếm dung lượng lịch sử Git.
3. Chạy `npm run build`. Build kiểm tra checksum, tạo `dist/client` cho BPNM và `dist/client-document-manage` cho SGII. Mỗi thư mục chứa đúng một tệp `downloads/android.apk`. Wrangler 3 của repo chỉ hỗ trợ `run_worker_first` dạng boolean. Cả hai cấu hình chạy Worker trước static assets để xử lý liên kết xác minh và đặt header tải APK chính xác trước SPA fallback. Các yêu cầu tài nguyên tĩnh cũng đi qua Worker.
4. Sau khi triển khai tenant bằng quy trình phát hành hiện có, mở `https://<tenant>.tungcv.vn/.well-known/assetlinks.json`. Kiểm tra HTTP 200, loại JSON, đúng một package và fingerprint khớp kết quả `apksigner verify --print-certs <tenant>.apk`. Qua trang `/install`, tải APK, kiểm tra SHA-256 của tệp so với `release.json`. Route tải là `/downloads/android.apk`. Cả metadata và tệp tải có thể truy cập trước khi đăng nhập.
5. Trên thiết bị Android có Chrome, mở APK và cấp quyền cài đặt từ nguồn này cho trình duyệt khi Android hỏi. Mở từ biểu tượng ứng dụng, xác nhận đúng tên miền và không có thanh địa chỉ. Có thể kiểm tra trên Android 12+ bằng `adb shell pm verify-app-links --re-verify <package>` rồi `adb shell pm get-app-links <package>`. Chờ xác minh nếu vừa thay DAL. Kiểm tra lần mở đầu và cập nhật đè lên bản cũ còn giữ dữ liệu. Khi website và chứng thư chưa xác minh được, Chrome có thể hiển thị thanh địa chỉ.

### Thay mật khẩu hoặc xoay khóa

Đổi mật khẩu keystore bằng công cụ quản lý PKCS12 trên bản sao đã sao lưu, xác nhận fingerprint giữ nguyên, cập nhật tệp mật khẩu tương ứng và nạp lại bốn secret của tenant. Với alias `release`, khóa và keystore dùng cùng mật khẩu.

Xoay **khóa ký** làm thay đổi fingerprint và ảnh hưởng khả năng cập nhật APK đã cài. Trước khi ký bản mới, cần lập kế hoạch chuyển khóa tương thích với các phiên bản Android đang dùng, thử cập nhật đè trên thiết bị thật và chuẩn bị Digital Asset Links cho các chứng thư cần hoạt động trong thời gian chuyển tiếp. Luồng phát hành hiện tại dùng một chứng thư cho mỗi tenant. Khi chủ hệ thống đã chọn phương án chuyển đổi, cập nhật khóa, fingerprint `fingerprints[0].value` của manifest, các secret và metadata đã xác minh. Mất khóa cũ có thể buộc người dùng gỡ và cài lại ứng dụng.

[Hướng dẫn TWA và Digital Asset Links của Chrome](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start) · [Hướng dẫn ký và xác minh APK của Android](https://developer.android.com/tools/apksigner) · [Định tuyến tài nguyên tĩnh của Cloudflare](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
