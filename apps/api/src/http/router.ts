export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface MatchedRoute<Ctx> {
  handler: RouteHandler<Ctx>;
  params: Record<string, string>;
}

export type RouteHandler<Ctx> = (
  ctx: Ctx,
  args: { params: Record<string, string>; body: unknown; query: URLSearchParams },
) => Promise<RouteResult> | RouteResult;

export interface RouteResult {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

interface Route<Ctx> {
  method: HttpMethod;
  segments: string[];
  handler: RouteHandler<Ctx>;
}

/** Tiny path router with `:param` support. Framework-free and easy to test. */
export class Router<Ctx> {
  private readonly routes: Route<Ctx>[] = [];

  add(method: HttpMethod, path: string, handler: RouteHandler<Ctx>): this {
    this.routes.push({ method, segments: splitPath(path), handler });
    return this;
  }

  get(path: string, handler: RouteHandler<Ctx>) {
    return this.add("GET", path, handler);
  }
  post(path: string, handler: RouteHandler<Ctx>) {
    return this.add("POST", path, handler);
  }
  patch(path: string, handler: RouteHandler<Ctx>) {
    return this.add("PATCH", path, handler);
  }

  match(method: string, path: string): MatchedRoute<Ctx> | null {
    const target = splitPath(path);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== target.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]!;
        const val = target[i]!;
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
        else if (seg !== val) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

function splitPath(path: string): string[] {
  return path.split("?")[0]!.split("/").filter(Boolean);
}
