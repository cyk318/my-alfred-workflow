import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

const query = process.argv[2] ?? "";
const section = process.env.URLJUMP_SECTION || "cd";
const configPath = `${process.env.HOME}/.config/urljump.toml`;

interface SectionConfig {
  tpl?: string;
  keys?: string[];
  urls?: Record<string, string>;
  dynamic_tpl?: string;
  dynamic_pattern?: string;
  require_query?: boolean;
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

if (!sectionConfig) {
  error(`配置中未找到 [data.${section}]`);
  process.exit(0);
}

const { tpl, urls, dynamic_tpl } = sectionConfig;
const keys = sectionConfig.keys ?? Object.keys(urls ?? {});

if (!keys.length && !dynamic_tpl) {
  error(`配置 [data.${section}] 缺少 keys/urls 或 dynamic_tpl`);
  process.exit(0);
}

const queryKey = query.trim().split(/\s+/)[0] ?? "";

if (sectionConfig.require_query && !queryKey) {
  error(`请输入环境或关键字`);
  process.exit(0);
}

const scored = keys
  .map((key) => ({ key, score: queryKey ? fuzzyScore(queryKey, key) : 1 }))
  .filter((item) => item.score > 0)
  .sort((a, b) => b.score - a.score);

if (!scored.length && queryKey && dynamic_tpl) {
  const pattern = sectionConfig.dynamic_pattern
    ? new RegExp(sectionConfig.dynamic_pattern)
    : undefined;
  if (!pattern || pattern.test(queryKey)) {
    const url = dynamic_tpl.replace("%s", queryKey);
    output([
      {
        title: queryKey,
        subtitle: url,
        arg: url,
        uid: queryKey,
      },
    ]);
    process.exit(0);
  }
}

const items: AlfredItem[] = scored.map((item) => {
  const url = urls?.[item.key] ?? tpl!.replace("%s", item.key);
  return {
    title: item.key,
    subtitle: url,
    arg: url,
    uid: item.key,
  };
});

output(items);
