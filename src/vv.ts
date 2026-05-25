const LOW = 25;
const HIGH = 55;

async function getVolume(): Promise<number> {
  const proc = Bun.spawnSync(["osascript", "-e", "output volume of (get volume settings)"]);
  return parseInt(proc.stdout.toString().trim(), 10);
}

async function setVolume(v: number): Promise<void> {
  Bun.spawnSync(["osascript", "-e", `set volume output volume ${v}`]);
}

const current = await getVolume();
const target = current === HIGH ? LOW : current === LOW ? HIGH : LOW;
await setVolume(target);

const msg = `Volume: ${current} → ${target}`;
Bun.spawnSync(["osascript", "-e", `display notification "${msg}" with title "Volume"`]);
