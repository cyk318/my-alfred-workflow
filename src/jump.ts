import { readdirSync, readFileSync, realpathSync, statSync } from "fs";
import { basename, join, resolve } from "path";
import { homedir } from "os";
import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

export interface Project {
  name: string;
  path: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", process.env.HOME!) : p;
}

export function scanProjects(dirs: string[]): Project[] {
  const projects: Project[] = [];
  for (const dir of dirs) {
    const absDir = resolve(expandHome(dir.trim()));
    let entries: string[];
    try {
      entries = readdirSync(absDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = resolve(absDir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          projects.push({ name: entry, path: fullPath });
        }
      } catch {
        continue;
      }
    }
  }
  return projects;
}

const projectDirs = [join(homedir(), "code/my"), join(homedir(), "code/duitang")];

/** 只搜索两个父目录的直接子目录，同名项目通过完整路径区分。 */
export function projectItems(projects: Project[], query: string): AlfredItem[] {
  const keyword = query.trim().toLowerCase();
  return projects
    .filter((project) => !project.name.startsWith("."))
    .map((project) => ({
      project,
      exact: project.name.toLowerCase() === keyword,
      score: keyword ? fuzzyScore(keyword, project.name) : 1,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.project.path.localeCompare(b.project.path))
    .map(({ project }) => ({
      title: project.name,
      subtitle: `切换或打开 IDEA 项目 · ${project.path}`,
      arg: project.path,
      uid: project.path,
      icon: { path: "jump.png" },
    }));
}

type CommandRunner = (args: string[]) => Promise<string>;

async function runCommand(args: string[]): Promise<string> {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `${args[0]} 执行失败`);
  return stdout.trim();
}

// 参数经 argv 传入，不把目录名拼入 AppleScript 或 shell 源码。
export const mergeProjectsScript = `
on run argv
  set projectName to item 1 of argv
  tell application "System Events"
    repeat 120 times
      set ideaProcesses to application processes whose bundle identifier is "com.jetbrains.intellij"
      if (count of ideaProcesses) > 0 then
        tell item 1 of ideaProcesses
          set windowTitle to ""
          try
            set windowTitle to name of window 1
          on error messageText number errorNumber
            -- 项目加载或切换桌面时，窗口可能暂时不在辅助功能树里。
            if errorNumber is not -1719 and errorNumber is not -1728 then error messageText number errorNumber
          end try
          if windowTitle is not "" then
            if windowTitle is projectName or windowTitle starts with (projectName & " – ") or windowTitle starts with (projectName & " — ") or windowTitle starts with (projectName & " - ") then
              set windowMenu to missing value
              repeat with menuName in {"Window", "窗口"}
                if exists menu bar item (contents of menuName) of menu bar 1 then
                  set windowMenu to menu 1 of menu bar item (contents of menuName) of menu bar 1
                  exit repeat
                end if
              end repeat
              if windowMenu is missing value then error "找不到 IDEA 的 Window / 窗口菜单"
              repeat with mergeName in {"Merge All Project Windows", "合并所有项目窗口"}
                if exists menu item (contents of mergeName) of windowMenu then
                  set mergeItem to menu item (contents of mergeName) of windowMenu
                  if enabled of mergeItem then click mergeItem
                  return
                end if
              end repeat
              error "找不到合并项目窗口菜单，请检查 IDEA 版本或界面语言"
            end if
          end if
        end tell
      end if
      delay 0.5
    end repeat
  end tell
  error "等待 IDEA 项目超时；请解锁屏幕并处理信任或导入对话框后重新执行 j"
end run
`;

/** 交给 IDEA 按真实路径复用项目，再将各项目窗口合并为标签页。 */
export async function openProject(projectPath: string, run: CommandRunner = runCommand): Promise<void> {
  if (!projectPath || !statSync(projectPath).isDirectory()) throw new Error("项目目录不存在");
  const path = realpathSync(projectPath);
  let projectName = basename(path);
  try {
    projectName = readFileSync(join(path, ".idea/.name"), "utf8").trim() || projectName;
  } catch {
    // 没有自定义项目名时，IDEA 使用目录名。
  }
  const accessible = await run(["/usr/bin/osascript", "-e", 'tell application "System Events" to get UI elements enabled']);
  if (accessible !== "true") throw new Error("请在系统设置 → 隐私与安全性 → 辅助功能中允许 Alfred 控制电脑");

  // macOS 打开文件事件由 IDEA 处理：已有项目聚焦，新项目保留其他项目。
  await run(["/usr/bin/open", "-a", "IntelliJ IDEA", path]);
  await run(["/usr/bin/osascript", "-e", mergeProjectsScript, projectName]);
}

if (import.meta.main) {
  const opening = process.argv[2] === "--open";
  try {
    if (opening) {
      await openProject(process.argv[3] ?? "");
    } else {
      const items = projectItems(scanProjects(projectDirs), process.argv[2] ?? "");
      output(items.length ? items : [{ title: "未找到匹配项目（~/code/my、~/code/duitang）", valid: false }]);
    }
  } catch (e) {
    const message = `IDEA 跳转失败：${e instanceof Error ? e.message : e}`;
    if (opening) {
      // Run Script 的 stdout 交给 Alfred 通知节点，失败不能只留在调试日志里。
      console.log(message);
      console.error(message);
      process.exitCode = 1;
    } else {
      error(message);
    }
  }
}
