# 开发指南

## 技术栈

- **运行时 & 构建**：[Bun](https://bun.sh) — 编译 TypeScript 为独立可执行文件
- **语言**：TypeScript
- **目标平台**：macOS (Alfred 5+)

## 项目结构

```
src/
├── alfred.ts      # 共享模块：Alfred JSON 输出格式封装
├── fuzzy.ts       # 共享模块：模糊匹配评分算法
├── jump.ts        # 工具 j：项目目录跳转
├── ci.ts          # 工具 ci：Jenkins Job 列表
├── vv.ts          # 工具 vv：音量切换
├── dd.ts          # 工具 dd：勿扰模式切换
└── urljump.ts     # 工具 cd/codeup/dt/dtw：URL 快速跳转

icons/             # 工具图标（SVG 源文件 + PNG 导出）
dist/              # 构建产物（编译后的可执行文件）
info.plist         # Alfred Workflow 元数据定义
```

## 共享模块

### alfred.ts

提供 Alfred Script Filter 的标准输出格式：

- `output(items)` — 输出 item 列表的 JSON
- `error(msg)` — 输出一条不可操作的错误提示
- `AlfredItem` — item 类型定义

### fuzzy.ts

`fuzzyScore(query, target)` — 返回模糊匹配分数，支持连续字符加分。所有 query 字符必须按序出现在 target 中才算匹配，否则返回 0。

## 构建 & 打包

```sh
# 安装依赖
bun install

# 编译所有工具为独立可执行文件到 dist/
bun run build

# 构建 + 打包为 .alfredworkflow（包含可执行文件、info.plist、图标）
bun run pack
```

`bun run build` 对每个工具执行 `bun build --compile`，生成的可执行文件无需 Bun 运行时即可运行。

`bun run pack` 在 build 基础上，将 `info.plist` 和图标复制到 dist 并打包为 zip（重命名为 `.alfredworkflow`）。

## 新增工具

1. **编写脚本**：在 `src/` 下新建 `<tool>.ts`
   - 需要 Alfred 列表输出的工具，引入 `alfred.ts` 和 `fuzzy.ts`
   - 从 `process.argv[2]` 读取用户输入，从 `process.env` 读取配置
   - 调用 `output(items)` 输出结果

2. **添加图标**：在 `icons/` 下放入 `<tool>.svg` 和 `<tool>.png`

3. **更新构建命令**：在 `package.json` 的 `build` 脚本中追加：
   ```
   bun build --compile src/<tool>.ts --outfile dist/<tool>
   ```

4. **配置 Alfred**：编辑 `info.plist`（推荐在 Alfred Workflow 编辑器中操作）
   - 添加 Script Filter / Run Script 节点
   - 指向编译后的 `dist/<tool>` 可执行文件
   - 根据需要连接 Open URL / Run Script 等 Action 节点

5. **验证**：
   ```sh
   bun run build
   ./dist/<tool> "test query"
   ```

## 工具模式参考

项目中的工具主要分为两类：

**Script Filter 类**（j, ci, cd/codeup/dt/dtw）— 接收用户输入，输出 Alfred item 列表供选择：
- 读取环境变量或配置文件
- Fetch 数据或扫描文件系统
- 模糊匹配 + 排序
- 输出 JSON

**Run Script 类**（vv, dd）— 直接执行操作，无需用户选择：
- 调用 `osascript` 或 `shortcuts` 命令
- 输出通知或日志
