### ✨ Features
- **[Config]** 新增了 `file_processor`**（默认为 Koishi）**，该配置决定了用于处理文件的平台（当前版本中文件仅包含**图片**和**视频**）
- **[Discord -> QQ]** 当 `file_processor` 的值为 `Koishi` 时文件处理流程会变为 `Discord --(文件 URL)--> Koishi (从文件 URL 下载文件) --(文件数据)--> QQBot (处理文件数据)`，这确保了 `QQBot` 在无法直接访问 Discord 的服务器上也能正常使用该插件
- **[Discord -> QQ]** 当 `file_processor` 的值为 `QQBot` 时文件处理流程会变为 `Discord --(文件 URL)--> Koishi --(文件 URL)--> QQBot (从文件 URL 下载文件并处理)`，这要求 `QQBot` 所在的服务器具备访问 Discord 的条件，否则将无法正常使用该插件

### 🐞 Bug Fixes
- None
