import { output, error, type AlfredItem } from "./alfred";
import { fuzzyScore } from "./fuzzy";

interface CodeupRepository {
  id: number;
  name: string;
  pathWithNamespace: string;
  webUrl: string;
}

type Requester = (url: URL, options: RequestInit) => Promise<Response>;

/** 读取全部分页，任一页失败时不把部分仓库误当成完整列表。 */
export async function fetchRepositories(
  token: string,
  organization: string,
  request: Requester = fetch,
): Promise<CodeupRepository[]> {
  const repositories: CodeupRepository[] = [];
  const signal = AbortSignal.timeout(15000);
  let totalPages: number | undefined;
  for (let page = 1; page <= 150; page++) {
    const url = new URL(`https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/${encodeURIComponent(organization)}/repositories`);
    url.search = new URLSearchParams({ page: String(page), perPage: "100", orderBy: "path", sort: "asc" }).toString();
    const response = await request(url, {
      headers: { "x-yunxiao-token": token, Accept: "application/json" },
      redirect: "manual",
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("认证失败，请检查 DUITANG_CODEUP_TOKEN 和代码仓库只读权限");
    }
    if (response.status === 429) throw new Error("请求过于频繁，请稍后重试");
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("接口返回非 JSON");
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every((repo) =>
      repo !== null && typeof repo === "object" && Number.isInteger(repo.id) &&
      typeof repo.name === "string" && repo.name.length > 0 &&
      typeof repo.pathWithNamespace === "string" &&
      typeof repo.webUrl === "string" && /^https?:\/\//.test(repo.webUrl)
    )) {
      throw new Error("仓库列表格式不正确");
    }
    const pagesHeader = response.headers.get("x-total-pages");
    const pages = pagesHeader && /^\d+$/.test(pagesHeader) ? Number(pagesHeader) : NaN;
    if (!Number.isSafeInteger(pages) || pages < 0 || pages > 150 ||
      (totalPages !== undefined && pages !== totalPages)) {
      throw new Error("仓库分页信息异常，请重试");
    }
    totalPages = pages;
    if ((!data.length && page < pages) || (pages === 0 && data.length > 0)) {
      throw new Error("仓库分页不完整，请重试");
    }
    repositories.push(...data);
    if (page >= pages) return repositories;
  }
  throw new Error("仓库列表超出分页上限");
}

/** 按仓库名称或分组路径匹配，跳转地址直接采用 Codeup 返回的 webUrl。 */
export function repositoryItems(repositories: CodeupRepository[], query: string): AlfredItem[] {
  const keyword = query.trim().toLowerCase();
  return repositories
    .map((repo) => ({
      repo,
      exact: repo.name.toLowerCase() === keyword,
      score: keyword ? Math.max(fuzzyScore(keyword, repo.name), fuzzyScore(keyword, repo.pathWithNamespace)) : 1,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.repo.pathWithNamespace.localeCompare(b.repo.pathWithNamespace))
    .map(({ repo }) => ({
      title: repo.name,
      subtitle: repo.pathWithNamespace,
      arg: repo.webUrl,
      uid: String(repo.id),
    }));
}

if (import.meta.main) {
  const token = process.env.DUITANG_CODEUP_TOKEN?.trim() || "";
  const organization = process.env.CODEUP_ORGANIZATION_ID?.trim() || "696621912baf901da4b64b75";
  if (!token) {
    error("请配置 DUITANG_CODEUP_TOKEN（需具有代码仓库只读权限）");
  } else {
    try {
      const items = repositoryItems(await fetchRepositories(token, organization), process.argv[2] ?? "");
      output(items.length ? items : [{ title: "未找到匹配的 Codeup 仓库", valid: false }]);
    } catch (e) {
      const message = e instanceof Error && e.name === "TimeoutError"
        ? "请求超时，请检查网络后重试"
        : e instanceof Error ? e.message : "网络请求失败";
      error(`Codeup 请求失败: ${message}`);
    }
  }
}
