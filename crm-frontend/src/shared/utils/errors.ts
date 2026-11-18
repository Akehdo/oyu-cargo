import { ApiError } from "../api/http";

export function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.fields) {
      return Object.values(error.fields).join(" ");
    }

    return error.message;
  }

  return "Не удалось выполнить действие.";
}
