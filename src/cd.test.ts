import { afterAll, expect, test } from "bun:test";
import { appItems, fetchApps } from "./cd";

let status = 200;
let payload: unknown = [{ name: "dt-vshop", state: "RUNNING" }, { name: "operator" }];
let contentType = "application/json";
let receivedPath = "";
let receivedToken = "";
let redirected = false;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    receivedPath = new URL(request.url).pathname;
    receivedToken = request.headers.get("X-Auth-Token") ?? "";
    if (receivedPath === "/login") redirected = true;
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": contentType, Location: "/login" },
    });
  },
});
afterAll(() => server.stop(true));

test("读取接口全量列表并传递用户 Token", async () => {
  expect(await fetchApps(server.url.href, "test-token")).toEqual([
    { name: "dt-vshop", state: "RUNNING" }, { name: "operator" },
  ]);
  expect(receivedPath).toBe("/m-api/cd/apps");
  expect(receivedToken).toBe("test-token");
});

test("拒绝认证失败、登录跳转、WAF 页面和错误响应结构", async () => {
  for (const code of [401, 403]) {
    status = code;
    await expect(fetchApps(server.url.href, "test-token")).rejects.toThrow("认证失败");
  }
  status = 302;
  await expect(fetchApps(server.url.href, "test-token")).rejects.toThrow("登录跳转");
  expect(redirected).toBe(false);
  status = 500;
  await expect(fetchApps(server.url.href, "test-token")).rejects.toThrow("HTTP 500");
  status = 200;
  contentType = "text/html";
  await expect(fetchApps(server.url.href, "test-token")).rejects.toThrow("非 JSON");
  contentType = "application/json";
  for (const invalid of [{ items: [] }, [null], [{ name: 123 }], [{ name: "" }]]) {
    payload = invalid;
    await expect(fetchApps(server.url.href, "test-token")).rejects.toThrow("格式不正确");
  }
  payload = [];
  expect(await fetchApps(server.url.href, "test-token")).toEqual([]);
});

test("空输入列出应用，模糊匹配忽略大小写，精确匹配排第一", () => {
  const apps = [{ name: "dt-vshop-worker" }, { name: "operator" }, { name: "dt-vshop" }];
  const webUrl = "https://prism2.dtactivity.cn/";
  expect(appItems(apps, "", webUrl)).toHaveLength(3);
  const items = appItems(apps, " DT-VSHOP ", webUrl);
  expect(items.map((item) => item.title)).toEqual(["dt-vshop", "dt-vshop-worker"]);
  expect(items[0]?.arg).toBe("https://prism2.dtactivity.cn/cd/apps/dt-vshop");
  expect(appItems(apps, "vsh", webUrl)).toHaveLength(2);
  expect(appItems(apps, "missing", webUrl)).toEqual([]);
  expect(appItems([{ name: "app/a b" }], "", webUrl)[0]?.arg).toEndWith("/app%2Fa%20b");
});

test("发布状态显示图标与文字，未知或缺失状态不会显示成功", () => {
  const cases = [
    ["RUNNING", "ci-success.png", "发布成功"],
    ["DEPLOYING", "ci-running.png", "发布中"],
    ["FAILED", "ci-failure.png", "发布失败"],
    ["MANUALLY_STOP", "ci-failure.png", "发布已手动停止"],
    ["UNKNOWN", "ci-unknown.png", "未知"],
    ["NEW_STATE", "ci-unknown.png", "未知"],
    [null, "ci-unknown.png", "未知"],
    [undefined, "ci-unknown.png", "未知"],
  ] as const;
  for (const [state, icon, label] of cases) {
    const item = appItems([{ name: "dt-vshop", state }], "vshop", "https://prism2.dtactivity.cn")[0];
    expect(item?.icon?.path).toBe(icon);
    expect(item?.subtitle).toStartWith(`发布状态：${label} · `);
    expect(item?.arg).toBe("https://prism2.dtactivity.cn/cd/apps/dt-vshop");
  }
});
