const DEFAULT_APP_URL = "http://localhost:3000";

export function getPublicAppUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL?.split(",")[0]?.trim() || DEFAULT_APP_URL;

  try {
    return new URL(rawUrl).origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}
