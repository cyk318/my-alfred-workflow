# My Alfred Workflow

一组实用的 Alfred 小工具集合，使用 Bun 编译为独立可执行文件，开箱即用。

## 工具一览

| 关键字 | 工具 | 功能 |
|--------|------|------|
| `j` | Jump | 模糊搜索项目目录，回车用编辑器打开 |
| `ci` | CI | 查看 Jenkins Job 列表及构建状态 |
| `vv` | Volume | 在低音量 (25) 和高音量 (55) 之间一键切换 |
| `dd` | DND | 通过 macOS 快捷指令切换勿扰模式 |
| `cd` / `code` | URL Jump | 基于配置文件的 URL 快速跳转 |
| `dt` / `dtw` | Operator Jump | 按环境跳转运营后台 |

## 安装

1. 从 Release 下载 `My-Workflow.alfredworkflow`，双击导入 Alfred
2. 或者手动构建（需安装 [Bun](https://bun.sh)）：
   ```sh
   bun install
   bun run pack
   # 双击生成的 My-Workflow.alfredworkflow 导入
   ```

## 配置

在 Alfred Workflow 的环境变量中设置以下参数：

### j (Jump)

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `SCAN_DIRS` | 是 | 要扫描的项目父目录，逗号分隔 | `~/code,~/work` |

输入 `j <关键字>` 模糊匹配目录名，回车打开对应路径。

### ci (Jenkins)

| 变量 | 必填 | 说明 |
|------|------|------|
| `JENKINS_URL` | 是 | Jenkins 根地址 |
| `JENKINS_USER` | 否 | 用户名（需配合 Token） |
| `JENKINS_TOKEN` | 否 | API Token |

输入 `ci <关键字>` 模糊搜索 Job，回车在浏览器打开对应 Job 页面。构建状态通过图标颜色区分：绿色成功、红色失败、蓝色运行中、灰色未知。
如果 `~/.config/urljump.toml` 配置了 `[data.ci].keys`，这些项目名会作为本地提示合并到 Jenkins Job 列表中。

### vv (Volume)

无需额外配置。触发后在音量 25 和 55 之间切换，并弹出系统通知显示变化。

### dd (DND)

需要在 macOS 快捷指令 App 中创建一个名为 `focus-toggle` 的快捷指令，用于切换勿扰/专注模式。

### cd / code (URL Jump)

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `URLJUMP_SECTION` | 否 | 使用的配置 section 名称 | `cd` |

配置文件路径：`~/.config/urljump.toml`，格式如下：

```toml
[data.cd]
tpl = "https://example.com/app/%s/dashboard"
keys = ["app-a", "app-b", "app-c"]

[data.dev]
tpl = "https://dev.example.com/%s"
keys = ["service-1", "service-2"]

[data.dt]
require_query = true
keys = ["online", "beta"]
urls = { online = "https://operate.duitang.com/backend/#/dashboard", beta = "https://operate-beta2.duitang.com/backend/#/dashboard" }
dynamic_pattern = "^0[0-9]{2}$"
dynamic_tpl = "https://operate-t%s.duitang.com/backend/#/dashboard"
```

输入 `cd <关键字>` 模糊匹配 key，回车在浏览器打开拼接后的 URL。`code <关键字>` 使用 `code` section。可通过 `URLJUMP_SECTION` 环境变量切换不同的 section。

输入 `dt <环境>` 或 `dtw <环境>` 按环境跳转运营后台，环境参数必须指定，例如 `online`、`beta`、`024`。匹配 `0xx` 的测试环境会通过 `dynamic_tpl` 动态拼接 URL。
