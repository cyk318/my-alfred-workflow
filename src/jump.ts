import { readdirSync, statSync } from "fs";
import { resolve } from "path";
import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

const query = process.argv[2] ?? "";
const scanDirs = process.env.SCAN_DIRS ?? "";

if (!scanDirs) {
  error("请配置环境变量 SCAN_DIRS");
  process.exit(0);
}

interface Project {
  name: string;
  path: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", process.env.HOME!) : p;
}

function scanProjects(dirs: string[]): Project[] {
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

const projects = scanProjects(scanDirs.split(","));

const scored = projects
  .map((p) => ({ ...p, score: query ? fuzzyScore(query, p.name) : 1 }))
  .filter((p) => p.score > 0)
  .sort((a, b) => b.score - a.score);

const items: AlfredItem[] = scored.map((p) => ({
  title: p.name,
  subtitle: p.path,
  arg: p.path,
  uid: p.path,
  icon: { path: "jump.png" },
}));

output(items);
