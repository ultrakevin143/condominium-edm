export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error?.message ?? "The request could not be completed.",
    );
  return body.data as T;
}
export function send<T>(path: string, body: unknown = {}, method = "POST") {
  return api<T>(path, { method, body: JSON.stringify(body) });
}
