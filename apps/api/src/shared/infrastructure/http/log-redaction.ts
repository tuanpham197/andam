/** Bearer secrets that travel in the path: invite links (BR-72). Never written to the logs. */
const SECRET_IN_PATH = /(\/invites\/)[^/?#]+/g;

export function redactPath(url: string): string {
  return url.replace(SECRET_IN_PATH, '$1[redacted]');
}

/** pino-http request serializer: the path without secrets; route params repeat the path, so they go. */
export function serializeRequest<
  T extends { url?: string; params?: unknown; [key: string]: unknown },
>(req: T): T {
  return { ...req, url: req.url && redactPath(req.url), params: undefined };
}
