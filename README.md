# My Alfred Workflow

一组实用的 Alfred 小工具集合，使用 Bun 编译为独立可执行文件，开箱即用。

## 工具一览

| 关键字 | 工具 | 功能 |
|--------|------|------|
| `j` | Jump | 模糊搜索项目目录，回车用编辑器打开 |
| `ci` | CI | 查看 Jenkins Job 列表及构建状态 |
| `vv` | Volume | 在低音量 (25) 和高音量 (55) 之间一键切换 |
| `dd` | DND | 通过 macOS 快捷指令切换勿扰模式 |
| `cd` | Prism2 CD | 实时查询 Prism2 应用，搜索后跳转发布页 |
| `co` | Codeup | 动态查询 Codeup 仓库，搜索后跳转仓库页面 |
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

### cd (Prism2 CD)

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `PRISM_URL` | 否 | 浏览器打开的 Prism2 根地址 | `https://prism2.dtactivity.cn` |
| `PRISM_API_URL` | 否 | 可直连的 Prism2 API 根地址，不含接口路径 | `http://10.0.48.40:19120` |
| `PRISM_TOKEN` | 是 | Prism2 用户 API Token，需具有 `m:read:cd` 权限 | 可从本机敏感配置加载 |

输入 `cd` 通过 `GET /m-api/cd/apps` 查询当前应用列表；输入 `cd dt-vshop` 或部分名称进行模糊匹配，回车打开 `https://prism2.dtactivity.cn/cd/apps/dt-vshop`。完整名称优先排列。不再读取 `[data.cd]`，也无需维护项目名清单。

列表同时显示发布状态文字，并复用 `ci` 图标：`RUNNING`（发布成功）为绿色，`DEPLOYING`（发布中）为进行中图标，`FAILED`（发布失败）和 `MANUALLY_STOP`（发布已手动停止）为红色，未知或缺失状态为灰色。状态来自 Prism2 的发布记录，不代表实时进程健康。

Token 使用 `X-Auth-Token` 请求头发送，可在 Prism2 的 `/m/users/tokens` 页面管理。可在 Alfred Workflow 环境变量中填写；未填写时，`cd` 入口会用 zsh 加载 `~/.zshrc_sensitive` 中的 `export PRISM_TOKEN=...`。Token 不写入仓库，导出 Workflow 时排除该变量。API Token 仍受角色权限控制，不是通用免鉴权 key。

默认 API 地址需要可访问内网的网络，浏览器仍打开公网 `PRISM_URL`。公网域名可能返回 WAF 页面或 SSO 登录跳转，因此 API 地址可以单独配置。请求最长等待 5 秒，认证失败、非 JSON 响应或网络异常会显示不可操作的错误提示。

### co (Codeup)

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `DUITANG_CODEUP_TOKEN` | 是 | Codeup 个人访问令牌，需要代码仓库只读权限 | 可从本机敏感配置加载 |
| `CODEUP_ORGANIZATION_ID` | 否 | Codeup 组织 ID | `696621912baf901da4b64b75` |

输入 `co` 查询当前 Token 可访问的全部仓库；输入 `co dt-vshop` 按仓库名称或分组路径模糊搜索，完整名称优先，回车打开接口返回的仓库页面。分组路径显示在副标题中，便于区分不同分组的同名仓库。原 `code` 关键字已替换为 `co`，不再读取 `[data.code]`。

Alfred 未配置 `DUITANG_CODEUP_TOKEN` 时，`co` 入口会用 zsh 加载 `~/.zshrc_sensitive` 中的同名环境变量。Token 不写入仓库，导出 Workflow 时排除该变量。

使用 Codeup [仓库列表 API](https://help.aliyun.com/zh/yunxiao/developer-reference/listrepositories-query-code-base-list)，每页 100 条并读取全部分页，整次查询最多等待 15 秒。认证失败、限流、分页不完整或网络异常会显示错误提示，不返回部分列表。

### dt / dtw (Operator Jump)

配置文件路径：`~/.config/urljump.toml`，格式如下：

```toml
[data.dt]
require_query = true
keys = ["online", "beta"]
urls = { online = "https://operate.duitang.com/backend/#/dashboard", beta = "https://operate-beta2.duitang.com/backend/#/dashboard" }
dynamic_pattern = "^0[0-9]{2}$"
dynamic_tpl = "https://operate-t%s.duitang.com/backend/#/dashboard"
```

通用 `urljump` 工具通过 `URLJUMP_SECTION` 环境变量选择 `dt` 或 `dtw` section。

输入 `dt <环境>` 或 `dtw <环境>` 按环境跳转运营后台，环境参数必须指定，例如 `online`、`beta`、`024`。匹配 `0xx` 的测试环境会通过 `dynamic_tpl` 动态拼接 URL。
