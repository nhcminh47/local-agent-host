# M0 trên Mac mini — không cần SSH

Cursor đang chạy trên Mac mini. Policy của người dùng không cho chia sẻ SSH; không cấu hình SSH hoặc remote access để chạy checklist này.

## 1. Chuẩn bị project

Chép source bundle `local-agent-host-m0.zip` sang Mac và giải nén vào thư mục project. Không cần gửi repo công ty, credential hoặc file `.env` về cuộc trò chuyện. Bundle không chứa node_modules, runtime Windows hay credentials.

Dùng Node 22.23.2 qua version manager hiện có; xác nhận `node --version` trước khi chạy. Cài pnpm 11.7.0 nếu máy chưa có, theo quy định của máy. Sau đó, tại thư mục project:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm test
pnpm spike:mcp
pnpm spike:process
```

Các bước trên kiểm tra TypeScript, native SQLite, MCP stdio và dừng cây tiến trình. Cần ghi cả kiến trúc Mac (`uname -m`) và kết quả; Windows pass không thay thế các bước này.

## 2. Kiểm tra repo chính ngay trên Mac

```sh
pnpm discover:repo /duong/dan/repo-chinh
```

Đọc `AGENTS.md`, hướng dẫn đóng góp, manifest/lockfile và CI ngay trên Mac. Chọn scripts typecheck/test/lint thực tế làm execution profiles. Không tự chạy install scripts/test của repo chỉ từ kết quả discovery. Chưa cần chia sẻ source hoặc đường dẫn nếu policy không cho phép; có thể chỉ báo package manager, các tên scripts và hạn chế cần giữ.

## 3. Kiểm tra Mac → Ollama PC

Deployment hiện thấy trên Windows: Ollama trong Docker, Caddy proxy publish cổng **11435**, yêu cầu Bearer token. Cổng 11434 chỉ ở trong Docker. Giữ proxy authentication hiện có.

Đặt `OLLAMA_BASE_URL` bằng địa chỉ LAN/Tailscale của PC mà Mac truy cập được, không dùng localhost của Mac. Tailscale trên Windows chưa xác nhận sẵn sàng. Dùng endpoint/network được policy cho phép; không mở firewall rộng hoặc chuyển sang public tunnel để vượt hạn chế.

Ví dụ địa chỉ có placeholder, không phải endpoint đã xác minh:

```sh
export OLLAMA_BASE_URL='http://PC_LAN_OR_TAILSCALE_IP:11435'
```

Provision `OLLAMA_API_KEY` bằng cơ chế secret local đang dùng. Không dán token vào lệnh lưu history hoặc tài liệu chia sẻ. Sau đó:

```sh
pnpm doctor
pnpm spike:ollama qwen3:8b gpt-oss:20b
```

Doctor pass xác nhận API version/inventory từ Mac. Tool spike pass xác nhận streaming và vòng tool result. Cold/warm timings trên Windows không phải latency từ Mac. HTTP với bearer token chỉ phù hợp LAN tin cậy; dùng đường Tailscale được phép hoặc TLS proxy khi đường truyền cần được mã hóa.

## 4. Cursor smoke test

Sau build, lấy `config/cursor-m0.example.json`, thay hai đường dẫn tuyệt đối bằng Node 22 và project trên Mac. Ghép entry `local-agent-m0` vào cấu hình MCP của Cursor, giữ nguyên các entry hiện có. Không cần truyền Ollama token cho MCP echo server.

Trong Cursor, xác nhận tool `m0_echo` xuất hiện và gọi với `text: "m0-cursor-ok"`. Kết quả phải là `m0-cursor-ok`. Server này chỉ là probe, chưa có analyze/implement/verify tools.

Ghi nhận: Cursor version, MCP tool discovery pass/fail, tool round-trip pass/fail và thông báo lỗi đã bỏ secrets. Không tự nhận M0 hoàn tất chỉ vì SDK-client probe pass.

## 5. Kết quả tối thiểu để đóng các gate Mac

- macOS/architecture, Node/pnpm versions.
- Check/test/MCP/process: pass hoặc lỗi đã lọc.
- Doctor: API reachable và model inventory có sẵn; không cần gửi token/IP nội bộ.
- Cursor echo pass/fail.
- Repo conventions và các execution profiles được chọn.

M0 vẫn còn đánh giá task coding thực tế và xử lý process orphan sau daemon crash; tool smoke không thay thế hai gate đó.
