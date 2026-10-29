// Types mirroring docs/api-contract.md (v1). Do not change these without
// changing the contract in both the client and server repositories.

export type FileType = "pdf" | "xlsx" | "xlsm" | "xls" | "unknown";

export type DocumentStatus =
  | "indexed" // fully extracted
  | "partiallyIndexed" // some pages/sheets failed or limits truncated content; see warnings
  | "noTextExtracted" // PDF with no usable text (likely scanned)
  | "empty" // valid file with no content
  | "unsupported" // file signature/extension not a supported type
  | "corrupt" // recognized type but unreadable or encrypted
  | "tooLarge"; // over the per-file size limit, or too large to process once uncompressed (Excel)

export interface SheetSummary {
  name: string;
  tableCount: number;
  rowCount: number; // non-empty rows in the sheet
}

export interface DocumentSummary {
  id: string; // server-generated, opaque
  fileName: string; // original name, display only
  fileType: FileType;
  sizeBytes: number;
  status: DocumentStatus;
  uploadedAt: string;
  pageCount: number | null; // PDFs only
  sheets: SheetSummary[] | null; // Excel only
  tableCount: number;
  chunkCount: number;
  warnings: string[]; // safe, user-facing
}

export type SourceLocation =
  | { type: "pdfPage"; page: number } // 1-based
  | { type: "excelRange"; sheet: string; range: string }; // A1 notation, e.g. "A5:F5"

export interface Citation {
  evidenceId: string;
  documentId: string;
  fileName: string;
  source: SourceLocation;
  snippet: string; // <= 300 chars
}

export interface EvidenceDetail {
  evidenceId: string;
  documentId: string;
  fileName: string;
  kind: "textChunk" | "tableRow";
  source: SourceLocation;
  text: string; // <= 4000 chars
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string; // assistant content contains only validated [E#] markers
  createdAt: string;
  citations: Citation[]; // empty for user messages
  incomplete: boolean; // true if the agent hit a limit; always false for user messages
}

// ---------------------------------------------------------------------------
// Error response ("Error response" section of the contract).
// ---------------------------------------------------------------------------

/** Error codes listed in the contract's error table. */
export type ApiErrorCode =
  | "validation_failed"
  | "session_required"
  | "session_not_found"
  | "evidence_not_found"
  | "question_in_progress"
  | "documents_processing"
  | "no_documents"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "provider_unavailable"
  | "internal_error";

/** Body of every non-2xx JSON response. `details` only accompanies `validation_failed`. */
export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  traceId: string;
  details?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Endpoint request/response bodies ("Endpoints" section of the contract).
// The contract describes these inline; the names below are client-side only.
// ---------------------------------------------------------------------------

/** `POST /api/sessions` -> 201 */
export interface CreateSessionResponse {
  sessionId: string; // 43-char base64url
  createdAt: string;
}

/** `POST /api/documents` and `GET /api/documents` -> 200 */
export interface DocumentsResponse {
  documents: DocumentSummary[];
}

/** `POST /api/chat` request body. */
export interface ChatRequest {
  question: string; // 1 to 4000 characters after trimming
}

/** `GET /api/chat/history` -> 200 */
export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// `POST /api/chat` server-sent events.
// ---------------------------------------------------------------------------

export interface StatusEventData {
  message: string;
  tool: string | null;
}

export interface DeltaEventData {
  text: string;
}

export interface CitationsEventData {
  citations: Citation[];
}

export interface DoneEventData {
  messageId: string;
  answer: string;
  incomplete: boolean;
}

export interface ErrorEventData {
  code: string;
  message: string;
  traceId: string;
}

export type ChatStreamEvent =
  | { event: "status"; data: StatusEventData }
  | { event: "delta"; data: DeltaEventData }
  | { event: "citations"; data: CitationsEventData }
  | { event: "done"; data: DoneEventData }
  | { event: "error"; data: ErrorEventData };
