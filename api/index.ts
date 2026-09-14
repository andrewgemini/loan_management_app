import type { RequestHandler } from "express";

let appPromise: Promise<RequestHandler> | null = null;

function getApp(): Promise<RequestHandler> {
  if (!appPromise) {
    appPromise = import("../server/_core/app")
      .then(({ createApiApp }) => createApiApp())
      .catch(error => {
        appPromise = null;
        throw error;
      });
  }
  return appPromise;
}

export default async function handler(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error("[Vercel API] Startup failed:", error);
    return res.status(500).json({
      error: "API startup failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
