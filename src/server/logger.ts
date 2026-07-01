export function isRuntimeDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.RUNTIME_DEBUG_LOGS === "true";
}

export function debugInfo(message: string, details?: Record<string, unknown>) {
  if (!isRuntimeDebugEnabled()) return;
  console.info(message, details);
}
