/**
 * Mutator used by every orval-generated call. Converts RFC 9457 problem details returned by
 * the API into `ApiError`, so UI code can branch on `status` / `code`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly errors: string[] = [],
  ) {
    super(detail ?? code);
    this.name = 'ApiError';
  }
}

export interface ApiClientAuth {
  getAccessToken(): string | null;
  /** Obtains a new access token (refresh cookie); resolves false when the session is over. */
  refreshAccessToken(): Promise<boolean>;
}

interface ApiClientConfig {
  baseUrl?: string;
  auth?: ApiClientAuth;
}

let config: ApiClientConfig = {};
let refreshInFlight: Promise<boolean> | null = null;

export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

const AUTH_ENDPOINTS = '/api/v1/auth/';

/** Concurrent 401s wait for the same refresh instead of each rotating the token (TC-AUTH-016). */
function refreshOnce(auth: ApiClientAuth): Promise<boolean> {
  refreshInFlight ??= auth.refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function send(url: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const token = config.auth?.getAccessToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  try {
    return await fetch(`${config.baseUrl ?? ''}${url}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response = await send(url, options);

  const auth = config.auth;
  if (response.status === 401 && auth && !url.startsWith(AUTH_ENDPOINTS)) {
    if (await refreshOnce(auth)) response = await send(url, options);
  }

  if (!response.ok) throw await toApiError(response);
  // 202/204 (and any empty body) carry no JSON.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    detail?: string;
    errors?: string[];
  };
  return new ApiError(
    response.status,
    body.code ?? `HTTP_${response.status}`,
    body.detail,
    body.errors ?? [],
  );
}

/** Picked up by orval: every generated hook is typed with `ApiError` as its error. */
export type ErrorType<_Error> = ApiError;
