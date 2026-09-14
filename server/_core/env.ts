const databaseUrl = process.env.DATABASE_URL
  ?? process.env.POSTGRES_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? "";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  // Explicit JWT_SECRET wins; legacy deployments may derive it from the effective Postgres URL.
  cookieSecret: process.env.JWT_SECRET ?? (databaseUrl ? `db:${databaseUrl}` : ""),
  databaseUrl,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
