import { expect, test } from "bun:test";
import { fetchRepositories, repositoryItems } from "./co";

const repository = (id: number, name: string, group = "backend") => ({
  id, name, pathWithNamespace: `org/${group}/${name}`,
  webUrl: `https://codeup.aliyun.com/org/${group}/${name}`,
});

test("读取全部分页并使用 Token 请求，不跟随跳转", async () => {
  const pages: string[] = [];
  const repos = await fetchRepositories("test-token", "org", async (url, options) => {
    expect(url.pathname).toBe("/oapi/v1/codeup/organizations/org/repositories");
    expect(new Headers(options.headers).get("x-yunxiao-token")).toBe("test-token");
    expect(options.redirect).toBe("manual");
    expect(url.searchParams.get("perPage")).toBe("100");
    const page = url.searchParams.get("page")!;
    pages.push(page);
    return Response.json([repository(Number(page), `repo-${page}`)], {
      headers: { "x-total-pages": "2" },
    });
  });
  expect(pages).toEqual(["1", "2"]);
  expect(repos).toHaveLength(2);
});

test("认证失败、限流、跳转和后续分页失败均不返回部分列表", async () => {
  for (const status of [401, 403, 429, 302, 500]) {
    await expect(fetchRepositories("test", "org", async () => new Response("", { status }))).rejects.toThrow();
  }
  await expect(fetchRepositories("test", "org", async (url) =>
    url.searchParams.get("page") === "1"
      ? Response.json([repository(1, "repo")], { headers: { "x-total-pages": "2" } })
      : new Response("", { status: 500 })
  )).rejects.toThrow("HTTP 500");
});

test("空仓库列表可用，异常格式、缺失或变化的分页被拒绝", async () => {
  expect(await fetchRepositories("test", "org", async () =>
    Response.json([], { headers: { "x-total-pages": "0", "x-next-page": "1" } })
  )).toEqual([]);
  for (const response of [
    new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }),
    Response.json({ items: [] }),
    Response.json([{ name: "bad" }]),
    Response.json([repository(1, "repo")]),
    Response.json([], { headers: { "x-total-pages": "2" } }),
  ]) {
    await expect(fetchRepositories("test", "org", async () => response)).rejects.toThrow();
  }
  await expect(fetchRepositories("test", "org", async (url) =>
    Response.json([repository(1, "repo")], {
      headers: { "x-total-pages": url.searchParams.get("page") === "1" ? "2" : "3" },
    })
  )).rejects.toThrow("分页信息异常");
});

test("完整名称优先、模糊搜索、分组搜索及同名仓库跳转", () => {
  const repos = [repository(1, "dt-vshop-worker"), repository(2, "dt-vshop"), repository(3, "dt-vshop", "frontend")];
  const items = repositoryItems(repos, " DT-VSHOP ");
  expect(items.map((item) => item.uid)).toEqual(["2", "3", "1"]);
  expect(items[0]?.arg).toBe(repos[1]!.webUrl);
  expect(items[1]?.subtitle).toBe("org/frontend/dt-vshop");
  expect(repositoryItems(repos, "vsh")).toHaveLength(3);
  expect(repositoryItems(repos, "frontend")).toHaveLength(1);
  expect(repositoryItems(repos, "")).toHaveLength(3);
  expect(repositoryItems(repos, "nonexistent")).toEqual([]);
});
