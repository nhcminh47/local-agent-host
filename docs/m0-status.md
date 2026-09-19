# M0 — Kết quả bước đầu

Ngày 17/09/2026. **M0 đã bắt đầu, chưa hoàn tất.** Project source ở `D:\Repo\local-agent-host`, Git branch `main`, chưa commit/push hoặc tạo remote. Chưa triển khai runtime production của M1.

## Đã hoàn thành trên Windows

| Hạng mục | Kết quả |
|---|---|
| Project | TypeScript strict/ESM, pnpm lockfile, README, AGENTS, architecture plan, M0 scripts, CI workflow và runbook Mac |
| Runtime | Node 22.23.2 riêng, xác minh SHA-256 từ Node release manifest; Node 26 của máy không thay đổi |
| Package manager | pnpm 11.7.0; install dependencies không chạy lifecycle scripts |
| Compile/typecheck | Pass |
| Tests | 2/2 pass: SQLite WAL/rollback/reopen/Unicode path; endpoint credential/URL rejection |
| MCP SDK v2 | Initialize, discovery, tool round-trip, invalid-input rejection pass qua stdio |
| Cursor trên Windows | Cursor 3.20.21 nhận server project-scoped, connected/1 tool enabled; Agent gọi `m0_echo` và trả đúng `m0-cursor-pc-ok` |
| Cursor → Ollama | Pass trên PC: Agent mới gọi `m0_ollama_probe` qua MCP tới qwen3:8b và nhận marker đúng; MCP wall 5.574s, model load 5.127s |
| Process tree | Dừng cả 3 tiến trình fixture trên Windows: pass, các lần đo khoảng 189–245ms |
| Ollama | Docker 0.31.1, GPU request hiện có, proxy Caddy cổng 11435 xác thực Bearer; doctor pass |
| Phần cứng | RTX 5060 Ti, khoảng 16GB VRAM; RAM hệ thống khoảng 32GB |
| Model tool calling | qwen3:8b, gpt-oss:20b và qwen3-coder:30b đều pass synthetic tool round-trip ở context 8192 |
| Coding fixture | qwen3:8b 2/2, gpt-oss:20b 2/2, qwen3-coder:30b 1/2, qwen2.5-coder 0/2; chi tiết dưới đây |
| Crash containment | Guardian độc lập dọn worker sau host kill trong khoảng 260ms và ghi receipt; mới là feasibility spike |

## Kết quả inference ban đầu

Mỗi model có một lượt đầu với tool schema và một lượt theo sau với tool result. Lúc bắt đầu không có model đang load; hai model được chạy tuần tự. Metrics do harness/Ollama trả về, chưa phải benchmark lặp nhiều lần.

| Model | Lượt đầu (wall) | First output | Load báo bởi Ollama | Lượt theo sau (wall) | GPU observation |
|---|---:|---:|---:|---:|---|
| qwen3:8b | 43.945s | 43.923s | 16.338s | 0.243s | 100% GPU; model residency khoảng 6.3GB |
| gpt-oss:20b | 52.856s | 52.496s | 31.129s | 0.527s | 100% GPU; model residency khoảng 12GB |
| qwen3-coder:30b | 26.407s | 26.401s | 23.749s | 0.863s | 75% GPU / 25% CPU; khoảng 15.7/16.3GB VRAM |

`first output` tính cả reasoning/tool-call output; không đồng nhất với thời gian xuất hiện text cho người dùng. Các completion rất ngắn, vì vậy không dùng tốc độ token hoặc bảng này để kết luận model nào coding tốt hơn. Chưa chạy task sửa repo thật hoặc benchmark context 16K. Model được giữ 5 phút theo request rồi Ollama tự unload theo cấu hình; không thay model defaults toàn server.

Model digests quan sát được:

- qwen3:8b: `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`
- gpt-oss:20b: `17052f91a42e97930aa6e28a6c6c06a983e6a58dbb00434885a0cf5313e376f7`
- qwen3-coder:30b: `06c1097efce0` (ID rút gọn do `ollama list` báo; model size 18GB)

## Coding evaluation có tool loop

Harness tạo thư mục tạm, chỉ cho model đọc/ghi `solution.ts`, chạy TypeScript compiler + hidden tests và gọi finish sau khi pass. Hai bài là pagination edge cases và dedupe với yêu cầu giữ thứ tự. Không dùng repo thật, không thực thi code do model cung cấp ngoài fixture test process có deadline.

| Model | Pagination | Dedupe | Quan sát |
|---|---:|---:|---|
| qwen3:8b | Pass, 6 tool calls, 2 writes/2 tests, 6.943s | Pass, 4 calls, 1 write/test, 7.089s | Nhanh nhất trong mẫu nhỏ; cần `think:false` để tool loop hội tụ. |
| gpt-oss:20b | Pass, 4 calls, 1 write/test, 18.895s | Pass, 4 calls, 1 write/test, 12.409s | Đúng cả hai; chậm hơn và dùng nhiều VRAM hơn trong quan sát trước. |
| qwen3-coder:30b | Pass, 7 calls, 1 write/test, 30.722s | Fail, 10 calls, 5 writes/4 tests, 58.177s | Dedupe fail được chạy lại riêng và vẫn fail sau 10 lượt/83.761s; model giữ bản ghi cuối nhưng sắp theo lần xuất hiện cuối (`a,c,b`) thay vì thứ tự xuất hiện đầu (`a,b,c`). |
| qwen2.5-coder | Fail, 0 tool calls, 13.210s | Fail, 0 tool calls, 4.102s | Không phát tool call sau 10 lượt nhắc; không phù hợp làm worker mặc định với protocol hiện tại. |
| sorc/qwen3.5-claude-4.6-opus:4b | Pass, 4 calls, 1 write/test, 21.457s | Pass, 4 calls, 1 write/test, 24.151s | Tool smoke pass; đúng cả hai nhưng chậm hơn các worker Qwen chính và là model tùy biến, chưa có vai trò riêng. |
| gemma4:e2b | Pass, 4 calls, 1 write/test, 27.529s | Fail, 2 calls, 0 writes/tests, 69.901s | Tool smoke pass nhưng không bắt đầu sửa bài dedupe; không phù hợp với tool loop hiện tại. |
| devstral:24b | Pass, 4 calls, 1 write/test, 37.357s | Pass cuối cùng, 7 calls, 2 writes/tests, 84.856s | Synthetic smoke không phát đúng tool call; coding loop đạt hidden tests 2/2 nhưng bài dedupe hết 10 lượt trước khi gọi finish. Ở 8K, Ollama báo 93% GPU / 7% CPU và khoảng 15.3/16.3GB VRAM. |

Ngày 18/09/2026, harness được mở rộng thành 10 fixture deterministic, bỏ fixture `chunk` vì trùng dạng lỗi với pagination. Bộ này bao phủ pagination, dedupe/order, prototype-safe indexing, strict parsing, falsy-aware merge, stable non-mutating sort, bidirectional range, counting, nullish compaction và last-index lookup. Đây vẫn là benchmark fixture M0, chưa phải 10 task end-to-end trên repo thật của M4.

Kết quả bộ 10 fixture chính thức:

| Model | Hidden tests | Lifecycle hoàn chỉnh | Tổng thời gian | Median/task | Min–max |
|---|---:|---:|---:|---:|---:|
| qwen3.5:9b | 10/10 | 10/10 | 96.525s | 9.600s | 5.369–14.016s |
| gpt-oss:20b | 10/10 | 10/10 | 102.840s | 8.046s | 6.031–25.728s |
| qwen3:8b | 8/10 | 8/10 | 62.255s | 3.814s | 2.772–17.874s |
| devstral:24b | 8/10 | 5/10 | 613.957s | 55.890s | 21.817–148.133s |

Qwen 3 8B fail `index-by-key` và `parse-port`, nhưng nhanh nhất nên giữ vai trò exploration. Devstral fail `merge-settings` và `count-by` do TypeScript syntax, ba task khác pass hidden tests nhưng hết turn budget trước `finish`; model cũng gần đầy VRAM và có CPU offload. Devstral đã được xoá sau benchmark. Profile khóa cho bước tiếp theo: qwen3:8b explorer, qwen3.5:9b implementer, gpt-oss:20b verifier/fallback.

## Cursor → MCP → Ollama trên PC

MCP thêm probe giới hạn model/marker, không đọc repo và không chạy tool từ model. Cursor project source cần được bật lại sau khi `.cursor/mcp.json` thay đổi; chat đã mở trước reload giữ tool snapshot cũ và có thể báo server không tồn tại. Agent mới sau reload nhận đủ 2 tools.

Kết quả Agent mới với qwen3:8b: `status=passed`, marker/output `m0-cursor-ollama-ok`, MCP wall 5574ms, load 5127ms, 9 generated tokens. Cursor hiển thị toàn lượt khoảng 16 giây. `envFile` trong cấu hình không truyền credential như kỳ vọng ở test này, nên M0 server đọc duy nhất `OLLAMA_API_KEY` từ file local được chỉ định bằng `OLLAMA_ENV_FILE`; token không được ghi vào config/log/output.

Raw sanitized doctor/inference reports nằm trong `.local/` bị Git ignore trên Windows; không đóng gói credential hoặc `.env`. Source bundle có đủ script để tái lập kết quả.

## Những gate còn mở

| Gate | Trạng thái / bước tiếp |
|---|---|
| Repo chính và conventions trên Mac | Chưa inspect. Chạy `discover:repo` và review instruction/manifest/CI tại Mac. |
| macOS runtime/SQLite/process compatibility | Chưa chạy. Làm theo `mac-m0-runbook.md`; workflow CI đã tạo nhưng chưa được chạy. |
| Cursor thật | **Windows pass** ngày 17/09/2026; Cursor trên Mac vẫn chưa kiểm tra. Xem `cursor-windows-m0.md`. |
| Mac → PC Ollama | Chưa xác minh LAN/Tailscale. Windows local proxy pass; Tailscale báo NoState tại thời điểm kiểm tra. |
| Coding evaluation/model selection | Hoàn tất 10 fixture cho bốn model và khóa profile: qwen3:8b explorer, qwen3.5:9b implementer, gpt-oss:20b verifier. Bộ task repo end-to-end vẫn thuộc M4. |
| Process orphan sau daemon crash | Guardian feasibility pass trên Windows; còn PID-start-time validation, durable ownership/receipt, guardian recovery và macOS test. |

Người dùng xác nhận Cursor ở Mac mini và không chia sẻ SSH do policy. Các gate Mac được chuyển thành checklist chạy trực tiếp trên máy; không yêu cầu remote access. Project không tự mở firewall, public tunnel, tải model hay sửa cấu hình Ollama/Caddy.

## Bước tiếp theo

Có thể tiếp tục model evaluation và crash-containment spike trên PC đã có Cursor. Chạy checklist Mac khi phù hợp để đóng các gate cross-platform/network, không cần SSH. M1 sẽ xây task contracts/queue/SQLite/bridge-daemon dựa trên các quyết định đã kiểm chứng.
