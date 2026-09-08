export type SessionIdentity = {
  openId: string;
  appId: string;
  name: string;
};

export function isValidSessionIdentity(value: unknown): value is SessionIdentity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return [candidate.openId, candidate.appId, candidate.name].every(
    (field) => typeof field === "string" && field.length > 0
  );
}

export function isCronSessionIdentity(openId: string): boolean {
  return openId.startsWith("cron_");
}

export function shouldSyncOAuthUser(userExists: boolean): boolean {
  return !userExists;
}
