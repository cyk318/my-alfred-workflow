import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

const query = process.argv[2] ?? "";
const section = process.env.URLJUMP_SECTION || "opsj";
const configPath = `${process.env.HOME}/.config/urljump.toml`;

interface SectionConfig {
  tpl: string;
  keys: string[];
}

let config: Record<string, unknown>;
try {
  const text = await Bun.file(configPath).text();
  config = Bun.TOML.parse(text) as Record<string, unknown>;
} catch (e) {
  error(`无法读取配置文件 ${configPath}: ${e}`);
  process.exit(0);
}

const data = config.data as Record<string, SectionConfig> | undefined;
const sectionConfig = data?.[section];

if (!sectionConfig?.tpl || !sectionConfig?.keys) {
  error(`配置中未找到 [data.${section}] 或缺少 tpl/keys`);
  process.exit(0);
}

const { tpl, keys } = sectionConfig;

const scored = keys
  .map((key) => ({ key, score: query ? fuzzyScore(query, key) : 1 }))
  .filter((item) => item.score > 0)
  .sort((a, b) => b.score - a.score);

const items: AlfredItem[] = scored.map((item) => {
  const url = tpl.replace("%s", item.key);
  return {
    title: item.key,
    subtitle: url,
    arg: url,
    uid: item.key,
  };
});

output(items);
