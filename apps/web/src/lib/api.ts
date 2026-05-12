const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:5000";

type ApiOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(options.headers);

  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${cleanPath}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      `API server is not reachable. The web app tried to reach ${API_BASE_URL}.`,
    );
  }

  const text = await response.text();

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: string }).message)
        : `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return data as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
