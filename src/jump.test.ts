import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { projectItems, openProject, scanProjects } from "./jump";

const root = mkdtempSync(join(tmpdir(), "alfred-jump-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("搜索两个父目录的项目，同名目录保留，隐藏目录和深层目录不显示", () => {
  for (const dir of ["my/dt-vshop", "duitang/dt-vshop", "duitang/dt-vshop-worker", "my/.hidden", "my/other/nested"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, "my/file.txt"), "not a project");
  const projects = scanProjects([join(root, "my"), join(root, "duitang"), join(root, "missing")]);
  expect(projectItems(projects, "")).toHaveLength(4);
  const items = projectItems(projects, " DT-VSHOP ");
  expect(items.map((item) => item.title)).toEqual(["dt-vshop", "dt-vshop", "dt-vshop-worker"]);
  expect(new Set(items.map((item) => item.uid)).size).toBe(3);
  expect(projectItems(projects, "vsh")).toHaveLength(3);
  expect(projectItems(projects, "nested")).toEqual([]);
  expect(projectItems(projects, "unmatched")).toEqual([]);
});

test("带空格和 shell 特殊字符的路径完整传参，自定义项目名用于等待窗口", async () => {
  const path = join(root, 'project "quoted" $(touch nope)');
  mkdirSync(join(path, ".idea"), { recursive: true });
  writeFileSync(join(path, ".idea/.name"), 'Custom "name"\n');
  const commands: string[][] = [];
  await openProject(path, async (args) => {
    commands.push(args);
    return commands.length === 1 ? "true" : "";
  });
  expect(commands[1]).toEqual(["/usr/bin/open", "-a", "IntelliJ IDEA", realpathSync(path)]);
  expect(commands[2]?.at(-1)).toBe('Custom "name"');
  expect(commands[2]?.[2]).not.toContain(path);
});

test("缺少辅助功能权限时不打开项目，系统打开失败时不继续合并", async () => {
  const commands: string[][] = [];
  await expect(openProject(root, async (args) => {
    commands.push(args);
    return "false";
  })).rejects.toThrow("辅助功能");
  expect(commands).toHaveLength(1);

  commands.length = 0;
  await expect(openProject(root, async (args) => {
    commands.push(args);
    if (args[0] === "/usr/bin/open") throw new Error("IDEA 未安装");
    return "true";
  })).rejects.toThrow("IDEA 未安装");
  expect(commands).toHaveLength(2);
  await expect(openProject("", async () => "")).rejects.toThrow("项目目录不存在");
});
