import { parseChatEvent, readSseStream } from "./sse";
import type {
  ApiErrorCode,
  ApiErrorResponse,
  ChatHistoryResponse,
  ChatRequest,
  ChatStreamEvent,
  CreateSessionResponse,
  DocumentSummary,
  DocumentsResponse,
  EvidenceDetail,
} from "./types";

const API_BASE_PATH = "/api";
const SESSION_HEADER = "X-Session-Id";

/** Session IDs issued by the server are 43-character base64url strings. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const KNOWN_API_ERROR_CODES: readonly ApiErrorCode[] = [
  "validation_failed",
  "session_required",
  "session_not_found",
  "evidence_not_found",
  "question_in_progress",
  "documents_processing",
  "no_documents",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "provider_unavailable",
  "internal_error",
];

/**
 * Codes produced by the client itself when no contract error body is available:
 * - `network_error`: the server could not be reached.
 * - `unexpected_response`: the server answered with something that is not the
 *   contract shape (for example an HTML proxy error page or malformed JSON).
 */
export type ClientErrorCode = "network_error" | "unexpected_response";

export class ApiError extends Error {
  readonly code: ApiErrorCode | ClientErrorCode;
  /** HTTP status, or 0 when no response was received. */
  readonly status: number;
  readonly traceId: string | null;
  readonly details: Record<string, string[]> | null;

  constructor(options: {
    code: ApiErrorCode | ClientErrorCode;
    status: number;
    message: string;
    traceId?: string | null;
    details?: Record<string, string[]> | null;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.traceId = options.traceId ?? null;
    this.details = options.details ?? null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True when a request was cancelled through an AbortSignal. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

/**
 * Returns a message that is safe to show to the user. Contract error messages are
 * documented as safe; anything else is replaced with a generic message so that
 * internals (stack traces, proxy pages, exception text) never reach the UI.
 */
export function getUserFacingErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function genericMessageForStatus(status: number): string {
  if (status === 413) {
    return "The request is too large. Try uploading fewer or smaller files.";
  }
  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "The server could not complete the request. Please try again.";
  }
  return "The request could not be completed. Please try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorDetails(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((message) => typeof message === "string"),
    )
  );
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (KNOWN_API_ERROR_CODES as readonly string[]).includes(value.code) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    typeof value.traceId === "string" &&
    (value.details === undefined || value.details === null || isErrorDetails(value.details))
  );
}

/**
 * Builds the ApiError for a non-2xx response from its status and parsed body (or null
 * when the body was not JSON). Shared by the fetch and XMLHttpRequest paths.
 */
function apiErrorFromBody(status: number, body: unknown): ApiError {
  if (isApiErrorResponse(body)) {
    return new ApiError({
      code: body.code,
      status,
      message: body.message,
      traceId: body.traceId,
      details: body.details ?? null,
    });
  }
  return new ApiError({
    code: "unexpected_response",
    status,
    message: genericMessageForStatus(status),
  });
}

function networkError(): ApiError {
  return new ApiError({
    code: "network_error",
    status: 0,
    message: "Could not reach the server. Check your connection and try again.",
  });
}

/** Converts a non-2xx response into an ApiError, using the contract body when present. */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    // A cancelled request must stay recognisable as cancelled, not become an API error.
    if (isAbortError(error)) {
      throw error;
    }
    // Not JSON (for example a proxy error page). Fall through to the generic message.
  }
  return apiErrorFromBody(response.status, body);
}

interface RequestOptions {
  method?: "GET" | "POST";
  /** Required for every endpoint except `POST /api/sessions`. */
  sessionId?: string;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Sends a request to the API and returns the successful Response.
 * Throws ApiError for network failures and non-2xx responses.
 * Abort errors are rethrown unchanged so callers can ignore them (see isAbortError).
 */
export async function sendApiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.sessionId !== undefined) {
    headers.set(SESSION_HEADER, options.sessionId);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw networkError();
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError({
      code: "unexpected_response",
      status: response.status,
      message: "The server returned an unexpected response. Please try again.",
    });
  }
}

function unexpectedResponse(status: number): ApiError {
  return new ApiError({
    code: "unexpected_response",
    status,
    message: "The server returned an unexpected response. Please try again.",
  });
}

function assertDocumentsResponse(value: unknown, status: number): DocumentsResponse {
  if (!isRecord(value) || !Array.isArray(value.documents)) {
    throw unexpectedResponse(status);
  }
  return value as unknown as DocumentsResponse;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** `POST /api/sessions` (no X-Session-Id header). */
export async function createSession(signal?: AbortSignal): Promise<CreateSessionResponse> {
  const response = await sendApiRequest("/sessions", { method: "POST", signal });
  const body = await readJson(response);
  if (!isRecord(body) || !isValidSessionId(body.sessionId) || typeof body.createdAt !== "string") {
    throw unexpectedResponse(response.status);
  }
  return { sessionId: body.sessionId, createdAt: body.createdAt };
}

/** `GET /api/documents` */
export async function listDocuments(sessionId: string, signal?: AbortSignal): Promise<DocumentsResponse> {
  const response = await sendApiRequest("/documents", { sessionId, signal });
  return assertDocumentsResponse(await readJson(response), response.status);
}

export interface UploadDocumentOptions {
  /** Called with the fraction (0 to 1) of the file's bytes sent so far; 1 once all are sent. */
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * `POST /api/documents` for a single file (one `files` part); returns its summary.
 * Uses XMLHttpRequest because fetch cannot report upload progress. Errors are mapped
 * exactly like the fetch path; cancelling `signal` rejects with an AbortError.
 */
export function uploadDocument(
  sessionId: string,
  file: File,
  options: UploadDocumentOptions = {},
): Promise<DocumentSummary> {
  const { onUploadProgress, signal } = options;

  return new Promise<DocumentSummary>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The upload was aborted.", "AbortError"));
      return;
    }

    const request = new XMLHttpRequest();
    const abortRequest = () => request.abort();

    request.open("POST", `${API_BASE_PATH}/documents`);
    request.setRequestHeader(SESSION_HEADER, sessionId);
    // Content-Type is intentionally not set: the browser adds the multipart boundary.

    // Upload listeners must be attached before send().
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress?.(Math.min(event.loaded / event.total, 1));
      }
    };
    request.upload.onload = () => onUploadProgress?.(1);

    request.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // Not JSON; handled below.
      }
      if (request.status < 200 || request.status >= 300) {
        reject(apiErrorFromBody(request.status, body));
        return;
      }
      if (!isRecord(body) || !Array.isArray(body.documents) || body.documents.length !== 1) {
        reject(unexpectedResponse(request.status));
        return;
      }
      resolve(body.documents[0] as DocumentSummary);
    };
    request.onerror = () => reject(networkError());
    request.ontimeout = () => reject(networkError());
    request.onabort = () => reject(new DOMException("The upload was aborted.", "AbortError"));
    request.onloadend = () => signal?.removeEventListener("abort", abortRequest);
    signal?.addEventListener("abort", abortRequest);

    const formData = new FormData();
    formData.append("files", file, file.name);
    request.send(formData);
  });
}

/** `GET /api/evidence/{evidenceId}` */
export async function getEvidence(
  sessionId: string,
  evidenceId: string,
  signal?: AbortSignal,
): Promise<EvidenceDetail> {
  const response = await sendApiRequest(`/evidence/${encodeURIComponent(evidenceId)}`, { sessionId, signal });
  const body = await readJson(response);
  if (!isRecord(body) || typeof body.evidenceId !== "string" || typeof body.text !== "string") {
    throw unexpectedResponse(response.status);
  }
  return body as unknown as EvidenceDetail;
}

/** `GET /api/chat/history` (oldest message first). */
export async function getChatHistory(sessionId: string, signal?: AbortSignal): Promise<ChatHistoryResponse> {
  const response = await sendApiRequest("/chat/history", { sessionId, signal });
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    throw unexpectedResponse(response.status);
  }
  return body as unknown as ChatHistoryResponse;
}

/**
 * `POST /api/chat`. Errors before the stream starts (validation, session,
 * `question_in_progress`, rate limits, ...) are thrown as ApiError. Once streaming,
 * every valid contract event is passed to `onEvent`; malformed and unknown events are
 * skipped. Resolves when the server closes the stream.
 */
export async function streamChat(
  sessionId: string,
  question: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const request: ChatRequest = { question };
  const response = await sendApiRequest("/chat", {
    method: "POST",
    sessionId,
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    signal,
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("text/event-stream") || response.body === null) {
    throw unexpectedResponse(response.status);
  }

  await readSseStream(
    response.body,
    (rawEvent) => {
      const parsed = parseChatEvent(rawEvent);
      if (parsed.kind === "event") {
        onEvent(parsed.value);
      }
    },
    signal,
  );
}
