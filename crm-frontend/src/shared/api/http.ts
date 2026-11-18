export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

export type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
};

type ErrorPayload = {
  code?: string;
  track_numbers?: string[];
  error?:
    | {
        code?: string;
        message?: string;
        fields?: Record<string, string>;
      }
    | string;
  message?: string | string[];
  statusCode?: number;
};

export class ApiError extends Error {
  status?: number;
  code?: string;
  fields?: Record<string, string>;
  trackNumbers?: string[];

  constructor(
    message: string,
    details: {
      status?: number;
      code?: string;
      fields?: Record<string, string>;
      trackNumbers?: string[];
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = details.status;
    this.code = details.code;
    this.fields = details.fields;
    this.trackNumbers = details.trackNumbers;
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super("Сессия истекла. Войдите снова.", {
      status: 401,
      code: "SESSION_EXPIRED",
    });
    this.name = "SessionExpiredError";
  }
}

export async function request<TResponse = unknown>(
  path: string,
  { body, headers, token, ...options }: ApiRequestOptions = {},
): Promise<TResponse> {
  const hasBody = body !== undefined;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const payload = await parsePayload(response);
  if (!response.ok) {
    const errorPayload = payload as ErrorPayload | null;
    const error = errorPayload?.error;
    const message = getErrorMessage(errorPayload);

    throw new ApiError(message || "Ошибка запроса", {
      status: response.status,
      code: errorPayload?.code ?? (typeof error === "object" ? error?.code : undefined),
      trackNumbers: errorPayload?.track_numbers,
      fields: typeof error === "object" ? error?.fields : undefined,
    });
  }

  return payload as TResponse;
}

function getErrorMessage(payload: ErrorPayload | null): string {
  if (!payload) {
    return "";
  }

  if (typeof payload.error === "object" && payload.error?.message) {
    return payload.error.message;
  }

  if (Array.isArray(payload.message)) {
    return payload.message.join(" ");
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  return "";
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
