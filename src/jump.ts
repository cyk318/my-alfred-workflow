import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "fs";
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
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", timeout: 150000 });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `${args[0]} 执行失败`);
  return stdout.trim();
}

/** 欢迎页没有 Window 菜单；File 菜单就绪后即可通过命令行打开第一个项目。 */
export const waitForIdeaScript = `
tell application "System Events"
  if not UI elements enabled then error "请在系统设置 → 隐私与安全性 → 辅助功能中允许 Alfred 控制电脑"
  repeat 240 times
    set ideaProcesses to application processes whose bundle identifier is "com.jetbrains.intellij"
    if (count of ideaProcesses) > 0 then
      tell item 1 of ideaProcesses
        if exists menu bar 1 then
          if (exists menu bar item "File" of menu bar 1) or (exists menu bar item "文件" of menu bar 1) then return
        end if
      end tell
    end if
    delay 0.5
  end repeat
end tell
error "IDEA 启动超过 120 秒，请检查启动界面后重新执行 j"
`;

// 参数经 argv 传入，不把目录名拼入 AppleScript 或 shell 源码。
export const mergeProjectsScript = `
on matchesProject(windowTitle, projectName)
  return windowTitle is projectName or windowTitle starts with (projectName & " – ") or windowTitle starts with (projectName & " — ") or windowTitle starts with (projectName & " - ")
end matchesProject

on run argv
  set projectName to item 1 of argv
  set merged to false
  tell application "System Events"
    repeat 240 times
      set ideaProcesses to application processes whose bundle identifier is "com.jetbrains.intellij"
      if (count of ideaProcesses) > 0 then
        tell item 1 of ideaProcesses
          try
            set windowMenu to missing value
            repeat with menuName in {"Window", "窗口"}
              if exists menu bar item (contents of menuName) of menu bar 1 then
                set windowMenu to menu 1 of menu bar item (contents of menuName) of menu bar 1
                exit repeat
              end if
            end repeat
            if windowMenu is not missing value then
              -- 合并窗口的非当前项目未必出现在 windows 列表中，要从 Window 菜单选中标签页。
              set projectEntries to menu items of windowMenu whose name is projectName
              if (count of projectEntries) is 1 then
                set visible to true
                set frontmost to true
                click item 1 of projectEntries
              end if
              repeat with projectWindow in (get windows)
                if my matchesProject(name of projectWindow, projectName) then
                  set visible to true
                  set frontmost to true
                  set value of attribute "AXMinimized" of projectWindow to false
                  perform action "AXRaise" of projectWindow
                  if merged then return
                  set mergeFound to false
                  repeat with mergeName in {"Merge All Project Windows", "Merge All Windows", "合并所有项目窗口", "合并所有窗口"}
                    if exists menu item (contents of mergeName) of windowMenu then
                      set mergeItem to menu item (contents of mergeName) of windowMenu
                      if enabled of mergeItem then click mergeItem
                      set mergeFound to true
                      exit repeat
                    end if
                  end repeat
                  -- 项目刚加载时菜单可能尚未更新，继续等待，不把短暂缺失当成失败。
                  if mergeFound then set merged to true
                  -- 合并可能改变当前标签页，下一轮重新选择并聚焦目标项目后才算完成。
                  exit repeat
                end if
              end repeat
            end if
          on error messageText number errorNumber
            -- 加载、合并和切换桌面时，辅助功能窗口引用可能暂时失效。
            if errorNumber is not -1719 and errorNumber is not -1728 then error messageText number errorNumber
          end try
        end tell
      end if
      delay 0.5
    end repeat
  end tell
  error "120 秒内未能聚焦目标项目；请解锁屏幕并处理信任或导入对话框后重新执行 j"
end run
`;

/** 交给 IDEA 按真实路径复用项目，再将各项目窗口合并为标签页。 */
export async function openProject(
  projectPath: string,
  run: CommandRunner = runCommand,
  launcher = ["/Applications/IntelliJ IDEA.app", join(homedir(), "Applications/IntelliJ IDEA.app")]
    .map((app) => join(app, "Contents/MacOS/idea")).find(existsSync),
): Promise<void> {
  if (!projectPath || !statSync(projectPath).isDirectory()) throw new Error("项目目录不存在");
  if (!launcher) throw new Error("未找到 IDEA 启动器，请将 IntelliJ IDEA 安装到 Applications 目录");
  const path = realpathSync(projectPath);
  let projectName = basename(path);
  try {
    projectName = readFileSync(join(path, ".idea/.name"), "utf8").trim() || projectName;
  } catch {
    // 没有自定义项目名时，IDEA 使用目录名。
  }
  // 只启动应用，不通过 macOS 打开文件事件传递项目，避免该入口携带当前项目关闭请求。
  await run(["/usr/bin/open", "-a", "IntelliJ IDEA"]);
  await run(["/usr/bin/osascript", "-e", waitForIdeaScript]);
  // 命令行入口按路径复用项目；只发送一次，不在加载期间重复创建/关闭同一个项目。
  await run([launcher, path]);
  await run(["/usr/bin/osascript", "-e", mergeProjectsScript, projectName]);
}

/** 记录实际 Alfred 入口的开始与结果，通知被静音时也能判断执行到了哪一步。 */
function logResult(projectPath: string, message: string): void {
  try {
    const directory = join(homedir(), "Library/Logs/my-alfred-workflow");
    mkdirSync(directory, { recursive: true });
    appendFileSync(join(directory, "jump.log"), `${new Date().toISOString()} ${JSON.stringify({ projectPath, message })}\n`);
  } catch {
    // 日志不可写时仍通过 Alfred 输出错误。
  }
}

if (import.meta.main) {
  const opening = process.argv[2] === "--open";
  try {
    if (opening) {
      logResult(process.argv[3] ?? "", "开始打开项目");
      await openProject(process.argv[3] ?? "");
      logResult(process.argv[3] ?? "", "项目已聚焦并完成窗口合并");
    } else {
      const items = projectItems(scanProjects(projectDirs), process.argv[2] ?? "");
      output(items.length ? items : [{ title: "未找到匹配项目（~/code/my、~/code/duitang）", valid: false }]);
    }
  } catch (e) {
    const message = `IDEA 跳转失败：${e instanceof Error ? e.message : e}`;
    if (opening) {
      logResult(process.argv[3] ?? "", message);
      // Run Script 的 stdout 交给 Alfred 通知节点，失败不能只留在调试日志里。
      console.log(message);
      console.error(message);
      process.exitCode = 1;
    } else {
      error(message);
    }
  }
}
