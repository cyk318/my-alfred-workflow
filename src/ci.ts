import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

const query = process.argv[2] ?? "";
const jenkinsUrl = process.env.JENKINS_URL ?? "";
const jenkinsUser = process.env.JENKINS_USER ?? "";
const jenkinsToken = process.env.JENKINS_TOKEN ?? "";
const configPath = `${process.env.HOME}/.config/urljump.toml`;
const showParams = (process.env.JENKINS_SHOW_PARAMS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!jenkinsUrl) {
  error("请配置环境变量 JENKINS_URL");
  process.exit(0);
}

interface JenkinsParameter {
  name: string;
  value: string | number | boolean | null;
}

interface JenkinsAction {
  parameters?: JenkinsParameter[];
}

interface JenkinsJob {
  name: string;
  url: string;
  color: string;
  healthReport?: { description: string; score: number }[];
  lastBuild?: {
    number: number;
    result: string | null;
    actions?: JenkinsAction[];
  };
}

interface JenkinsResponse {
  jobs: JenkinsJob[];
}

interface UrlJumpConfig {
  data?: {
    ci?: {
      keys?: string[];
    };
  };
}

function buildApiUrl(includeParams: boolean): string {
  const lastBuildTree = includeParams
    ? "lastBuild[number,result,actions[parameters[name,value]]]"
    : "lastBuild[number,result]";
  const params = new URLSearchParams({
    tree: `jobs[name,url,color,healthReport[description,score],${lastBuildTree}]`,
  });
  return `${jenkinsUrl.replace(/\/$/, "")}/api/json?${params}`;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (jenkinsUser && jenkinsToken) {
    headers["Authorization"] =
      "Basic " + btoa(`${jenkinsUser}:${jenkinsToken}`);
  }
  return headers;
}

async function requestJobs(includeParams: boolean): Promise<JenkinsJob[]> {
  const resp = await fetch(buildApiUrl(includeParams), {
    headers: buildHeaders(),
    redirect: "manual",
  });
  const location = resp.headers.get("location") ?? "";
  if (resp.status >= 300 && resp.status < 400) {
    throw new Error(
      location.includes("sso")
        ? "Jenkins API 被 SSO 重定向，请配置可访问 API 的认证"
        : `Jenkins API ${resp.status}`,
    );
  }
  if (!resp.ok) {
    throw new Error(`Jenkins API ${resp.status}`);
  }
  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Jenkins API 返回非 JSON: ${contentType || "unknown"}`);
  }
  const data = (await resp.json()) as JenkinsResponse;
  return data.jobs ?? [];
}

async function fetchJobs(): Promise<JenkinsJob[]> {
  const includeParams = showParams.length > 0;
  try {
    return await requestJobs(includeParams);
  } catch (e) {
    if (includeParams) {
      return await requestJobs(false);
    }
    throw e;
  }
}

async function loadCiHints(): Promise<JenkinsJob[]> {
  try {
    const text = await Bun.file(configPath).text();
    const config = Bun.TOML.parse(text) as UrlJumpConfig;
    const keys = config.data?.ci?.keys ?? [];
    return keys
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        url: `${jenkinsUrl.replace(/\/$/, "")}/job/${encodeURIComponent(name)}/`,
        color: "notbuilt",
      }));
  } catch {
    return [];
  }
}

function mergeJobs(jobs: JenkinsJob[], hints: JenkinsJob[]): JenkinsJob[] {
  const names = new Set(jobs.map((job) => job.name));
  const missingHints = hints.filter((job) => !names.has(job.name));
  return [...jobs, ...missingHints];
}

try {
  const jobs = mergeJobs(await fetchJobs(), await loadCiHints());

  const scored = jobs
    .map((job) => ({ ...job, score: query ? fuzzyScore(query, job.name) : 1 }))
    .filter((j) => j.score > 0)
    .sort((a, b) => b.score - a.score);

  const items: AlfredItem[] = scored.map((job) => {
    const build = job.lastBuild;
    const buildInfo = build ? ` [#${build.number} - ${build.result ?? "RUNNING"}]` : "";
    const health = job.healthReport?.[0]?.description ?? "";

    let paramInfo = "";
    if (showParams.length && build?.actions) {
      const params = build.actions.find((a) => a.parameters)?.parameters ?? [];
      const paramMap = new Map(params.map((p) => [p.name, p.value]));
      const parts = showParams
        .filter((n) => paramMap.has(n))
        .map((n) => `${n}=${paramMap.get(n)}`);
      if (parts.length) paramInfo = parts.join(" · ");
    }
    const subtitle = paramInfo
      ? (health ? `${paramInfo} · ${health}` : paramInfo)
      : (health || job.url);

    const result = build?.result;
    const iconMap: Record<string, string> = {
      SUCCESS: "ci-success.png",
      FAILURE: "ci-failure.png",
      ABORTED: "ci-failure.png",
      UNSTABLE: "ci-failure.png",
    };
    const icon = result ? (iconMap[result] ?? "ci-unknown.png") : (build ? "ci-running.png" : "ci-unknown.png");

    return {
      title: `${job.name}${buildInfo}`,
      subtitle,
      arg: job.url,
      uid: job.name,
      icon: { path: icon },
    };
  });

  output(items);
} catch (e) {
  error(`Jenkins 请求失败: ${e instanceof Error ? e.message : e}`);
}
