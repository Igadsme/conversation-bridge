import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

// API proxy: forward /api/* to the standalone Sora backend
// (the root repo's server/). In development the backend runs on
// http://127.0.0.1:3001 — `npm run dev:server` in the repo root.
//
// TanStack Start's server middleware answers every request (SSR),
// so Vite's dev proxy never sees /api. This middleware runs
// before the router instead.
//
// Enable it: always in `vite dev`, and in a built app only when
// SORA_API_UPSTREAM is set (point it at the deployed backend).
const API_UPSTREAM = process.env.SORA_API_UPSTREAM ?? "http://127.0.0.1:3001";

const apiProxyMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return next();
  if (!import.meta.env.DEV && !process.env.SORA_API_UPSTREAM) return next();

  const target = new URL(url.pathname + url.search, API_UPSTREAM);
  const headers = new Headers(request.headers);
  headers.set("host", new URL(API_UPSTREAM).host);

  const hasBody = !["GET", "HEAD"].includes(request.method) && request.body != null;
  const response = await fetch(target, {
    method: request.method,
    headers,
    // undici requires duplex when the body is a stream
    ...(hasBody ? { body: request.body, duplex: "half" as const } : {}),
  });
  return response;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [apiProxyMiddleware, errorMiddleware, csrfMiddleware],
}));
