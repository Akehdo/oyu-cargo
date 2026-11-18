export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

export type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
};

type ErrorPayload = {
  error?:
    | {
        code?: string;
        message?: string;
      }
    | string;
  message?: string | string[];
  statusCode?: number;
};

export class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(
    message: string,
    details: {
      status?: number;
      code?: string;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = details.status;
    this.code = details.code;
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError("Нет связи с сервером. Проверьте интернет.", {
      code: "NETWORK_ERROR",
    });
  }

  const payload = await parsePayload(response);
  if (!response.ok) {
    const errorPayload = payload as ErrorPayload | null;
    const error = errorPayload?.error;

    throw new ApiError(
      getErrorMessage(errorPayload) || defaultMessage(response.status),
      {
        status: response.status,
        code: typeof error === "object" ? error?.code : undefined,
      },
    );
  }

  return payload as TResponse;
}

/** Human-friendly message for any thrown value. */
export function errorText(error: unknown, fallback = "Что-то пошло не так"): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function defaultMessage(status: number): string {
  if (status >= 500) {
    return "Сервер временно недоступен. Попробуйте позже.";
  }

  if (status === 429) {
    return "Слишком много попыток. Подождите немного.";
  }

  return "Ошибка запроса";
}

function getErrorMessage(payload: ErrorPayload | null): string {
  if (!payload || typeof payload !== "object") {
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
