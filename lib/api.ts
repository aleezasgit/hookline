import type { ApiErrorBody } from "@/lib/types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function req<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = { ...extraHeaders };
  if (!isForm && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong. Try again.", r.status);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
  // H3: a fresh Idempotency-Key per call. If the exact same request somehow lands
  // twice (a network retry, or a click that slips past the button's own disabled
  // state), the server recognizes the duplicate and returns the original result
  // instead of creating or charging a second time.
  postIdempotent: <T>(p: string, b?: unknown) => req<T>("POST", p, b, { "Idempotency-Key": crypto.randomUUID() }),
};
export const fetcher = <T>(p: string) => api.get<T>(p);
