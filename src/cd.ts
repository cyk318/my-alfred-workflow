import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

interface PrismApp {
  name: string;
  /** Prism2 记录的发布状态，不代表实时进程健康。 */
  state?: string | null;
}

const unknownState = { label: "未知", icon: "ci-unknown.png" };
const deployStates = new Map([
  ["RUNNING", { label: "发布成功", icon: "ci-success.png" }],
  ["DEPLOYING", { label: "发布中", icon: "ci-running.png" }],
  ["FAILED", { label: "发布失败", icon: "ci-failure.png" }],
  ["MANUALLY_STOP", { label: "发布已手动停止", icon: "ci-failure.png" }],
  ["UNKNOWN", unknownState],
]);

/** 获取真实应用列表；失败时不再用本地写死的项目名补齐。 */
export async function fetchApps(apiUrl: string, token: string): Promise<PrismApp[]> {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/m-api/cd/apps`, {
    headers: { "X-Auth-Token": token, Accept: "application/json" },
    // 登录跳转不能携带 Token 继续请求其他地址。
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("接口发生登录跳转，请将 PRISM_API_URL 配为可直连的 API 地址");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("认证失败，请检查 PRISM_TOKEN 是否有效并具有 m:read:cd 权限");
  }
  if (!response.ok) {
    throw new Error(`API HTTP ${response.status}`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("接口返回非 JSON，可能被 WAF 或登录页拦截，请检查 PRISM_API_URL");
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every((app) =>
    app !== null && typeof app === "object" &&
    typeof app.name === "string" && app.name.trim().length > 0
  )) {
    throw new Error("应用列表格式不正确");
  }
  return data;
}

/** 复用模糊匹配，完整项目名优先；浏览器始终打开网页地址。 */
export function appItems(apps: PrismApp[], query: string, webUrl: string): AlfredItem[] {
  const keyword = query.trim().toLowerCase();
  return apps
    .map((app) => ({
      name: app.name,
      state: app.state,
      exact: app.name.toLowerCase() === keyword,
      score: keyword ? fuzzyScore(keyword, app.name) : 1,
    }))
    .filter((app) => app.score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.name.localeCompare(b.name))
    .map(({ name, state }) => {
      const url = `${webUrl.replace(/\/+$/, "")}/cd/apps/${encodeURIComponent(name)}`;
      // 缺失或新增的状态按未知展示，避免误标为发布成功。
      const status = deployStates.get(state ?? "") ?? unknownState;
      return {
        title: name,
        subtitle: `发布状态：${status.label} · ${url}`,
        arg: url,
        uid: name,
        icon: { path: status.icon },
      };
    });
}

if (import.meta.main) {
  const webUrl = process.env.PRISM_URL?.trim() || "https://prism2.dtactivity.cn";
  const apiUrl = process.env.PRISM_API_URL?.trim() || "http://10.0.48.40:19120";
  const token = process.env.PRISM_TOKEN?.trim() || "";
  if (!token) {
    error("请配置 PRISM_TOKEN（Prism2 用户 API Token，需具有 m:read:cd 权限）");
  } else {
    try {
      const items = appItems(await fetchApps(apiUrl, token), process.argv[2] ?? "", webUrl);
      output(items.length ? items : [{ title: "未找到匹配的 Prism2 应用", valid: false }]);
    } catch (e) {
      const message = e instanceof Error && e.name === "TimeoutError"
        ? "请求超时，请检查网络与 PRISM_API_URL"
        : e instanceof Error ? e.message : "网络请求失败";
      error(`Prism2 请求失败: ${message}`);
    }
  }
}
