import type { AppState, DesktopAPI } from "../../shared/types";

interface WebViewMessage {
  id?: number;
  result?: unknown;
  error?: string;
  event?: "state" | "navigate";
  value?: unknown;
}
type NativeWebView = {
  postMessage: (message: unknown) => void;
  addEventListener: (
    event: "message",
    listener: (event: MessageEvent<WebViewMessage>) => void,
  ) => void;
};

export function installDesktopBridge() {
  if (window.huazheshu) return;
  const webview = (
    window as unknown as { chrome?: { webview?: NativeWebView } }
  ).chrome?.webview;
  if (!webview) return;
  let sequence = 0;
  const requests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const stateListeners = new Set<(state: AppState) => void>();
  const navigationListeners = new Set<(date: string) => void>();
  webview.addEventListener("message", ({ data }) => {
    if (data.event === "state")
      stateListeners.forEach((listener) => listener(data.value as AppState));
    if (data.event === "navigate")
      navigationListeners.forEach((listener) => listener(data.value as string));
    if (data.id === undefined) return;
    const request = requests.get(data.id);
    if (!request) return;
    requests.delete(data.id);
    if (data.error !== undefined) request.reject(new Error(data.error));
    else request.resolve(data.result);
  });
  function invoke<T>(method: string, argument?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      requests.set(id, { resolve: (value) => resolve(value as T), reject });
      try {
        webview!.postMessage({ id, method, argument });
      } catch (error) {
        requests.delete(id);
        reject(error);
      }
    });
  }
  const api: DesktopAPI = {
    getState: () => invoke("state:get"),
    command: (command) => invoke("state:command", command),
    onState: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onNavigate: (listener) => {
      navigationListeners.add(listener);
      return () => navigationListeners.delete(listener);
    },
    exportBackup: () => invoke("backup:export"),
    importBackup: () => invoke("backup:import"),
    openDataFolder: () => invoke("data:open"),
    testNotification: () => invoke("notification:test"),
    getAppInfo: () => invoke("app:info"),
  };
  Object.defineProperty(window, "huazheshu", { value: Object.freeze(api) });
}
