import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { API_ROOT, APP_NAME } from "@retempo/shared";

export const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: APP_NAME,
    apiRoot: API_ROOT
  });
});

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port
});
