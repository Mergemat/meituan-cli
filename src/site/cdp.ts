// The slice of the Chrome DevTools Protocol this CLI needs, over Bun's built-in WebSocket.
// No browser-automation library: those read their own files at runtime and break single-binary builds.

type Params = Record<string, unknown>;
type Listener = (params: Params, sessionId?: string) => void;

interface Message {
  error?: { message: string };
  id?: number;
  method?: string;
  params?: Params;
  result?: unknown;
  sessionId?: string;
}

export class Cdp {
  private readonly ws: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { reject: (e: Error) => void; resolve: (v: unknown) => void }
  >();
  private readonly listeners = new Map<string, Set<Listener>>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (e) => this.receive(String(e.data)));
    ws.addEventListener("close", () => {
      for (const p of this.pending.values()) {
        p.reject(new Error("The browser closed."));
      }
      this.pending.clear();
      this.emit("closed", {});
    });
  }

  static connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener(
        "error",
        () => reject(new Error("Could not connect to the browser.")),
        { once: true }
      );
    });
  }

  send<T = Params>(method: string, params: Params = {}, sessionId?: string) {
    this.nextId += 1;
    const id = this.nextId;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: resolve as (v: unknown) => void,
      });
    });
  }

  /** Subscribes to an event; returns the unsubscribe function. "closed" fires when the browser goes away. */
  on(method: string, listener: Listener): () => void {
    const set = this.listeners.get(method) ?? new Set();
    set.add(listener);
    this.listeners.set(method, set);
    return () => set.delete(listener);
  }

  close() {
    this.ws.close();
  }

  private emit(method: string, params: Params, sessionId?: string) {
    for (const l of this.listeners.get(method) ?? []) {
      l(params, sessionId);
    }
  }

  private receive(raw: string) {
    const msg = JSON.parse(raw) as Message;
    if (msg.id === undefined) {
      if (msg.method) {
        this.emit(msg.method, msg.params ?? {}, msg.sessionId);
      }
      return;
    }
    const waiter = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (msg.error) {
      waiter?.reject(new Error(msg.error.message));
    } else {
      waiter?.resolve(msg.result);
    }
  }
}

/** One browser tab, driven through a flattened DevTools session. */
export class Tab {
  readonly cdp: Cdp;
  private readonly sessionId: string;
  private readonly targetId: string;

  private constructor(cdp: Cdp, sessionId: string, targetId: string) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  /** The browser's first tab (Chrome opens one at start), or a new one. */
  static async open(cdp: Cdp): Promise<Tab> {
    const { targetInfos } = await cdp.send<{
      targetInfos: { targetId: string; type: string }[];
    }>("Target.getTargets");
    const targetId =
      targetInfos.find((t) => t.type === "page")?.targetId ??
      (
        await cdp.send<{ targetId: string }>("Target.createTarget", {
          url: "about:blank",
        })
      ).targetId;
    const { sessionId } = await cdp.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { flatten: true, targetId }
    );
    return new Tab(cdp, sessionId, targetId);
  }

  send<T = Params>(method: string, params: Params = {}) {
    return this.cdp.send<T>(method, params, this.sessionId);
  }

  async navigate(url: string) {
    const r = await this.send<{ errorText?: string }>("Page.navigate", { url });
    if (r.errorText) {
      throw new Error(`${r.errorText} loading ${url}`);
    }
  }

  /** Runs `fn(arg)` in the page and returns its JSON result. `fn` must be self-contained: it is sent as source. */
  async evaluate<A, T>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T> {
    const r = await this.send<{
      exceptionDetails?: { exception?: { description?: string }; text: string };
      result: { value: T };
    }>("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(${fn.toString()})(${JSON.stringify(arg)})`,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(d.exception?.description ?? d.text);
    }
    return r.result.value;
  }

  /** Calls `listener` with the URL whenever the main frame navigates, including in-page (history API) changes. */
  onNavigate(listener: (url: string) => void): () => void {
    const mine = (sessionId?: string) => sessionId === this.sessionId;
    const offFull = this.cdp.on("Page.frameNavigated", (p, s) => {
      const frame = p.frame as { parentId?: string; url: string };
      if (mine(s) && !frame.parentId) {
        listener(frame.url);
      }
    });
    const offInPage = this.cdp.on("Page.navigatedWithinDocument", (p, s) => {
      if (mine(s)) {
        listener(String(p.url));
      }
    });
    return () => {
      offFull();
      offInPage();
    };
  }

  /** Resolves when the user closes this tab or the whole browser. */
  closed(): Promise<void> {
    return new Promise((resolve) => {
      this.cdp.on("Target.targetDestroyed", (p) => {
        if (p.targetId === this.targetId) {
          resolve();
        }
      });
      this.cdp.on("closed", () => resolve());
    });
  }
}
