const SHORTCUT_NAME = "focus-toggle";

const list = Bun.spawnSync(["shortcuts", "list"]);
if (!list.stdout.toString().includes(SHORTCUT_NAME)) {
  console.log(`请先创建快捷指令 "${SHORTCUT_NAME}"`);
  process.exit(0);
}

const proc = Bun.spawnSync(["shortcuts", "run", SHORTCUT_NAME]);
if (proc.exitCode !== 0) {
  console.log("执行失败: " + proc.stderr.toString().trim());
  process.exit(1);
}

console.log("DND Toggled");
