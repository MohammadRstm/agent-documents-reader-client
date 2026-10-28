import type { ChatStreamEvent, Citation, SourceLocation } from "./types";

// `POST /api/chat` answers with `text/event-stream`. EventSource only supports GET,
// so the stream is read from fetch's ReadableStream and parsed here.

/** One dispatched server-sent event before its data is interpreted. */
export interface RawSseEvent {
  event: string;
  data: string;
}

/**
 * Incremental parser for the text/event-stream format (WHATWG HTML spec, 9.2.6).
 * Feed decoded text with `push` in arbitrary pieces; complete events are passed to
 * `onEvent` as soon as their terminating blank line arrives. Supports LF, CRLF and
 * CR line endings (including a CRLF split across two chunks), comment lines,
 * multi-line `data` fields and the optional single space after the colon.
 * `id` and `retry` fields are ignored because the stream is never reconnected.
 */
export class SseParser {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];
  private readonly onEvent: (event: RawSseEvent) => void;

  constructor(onEvent: (event: RawSseEvent) => void) {
    this.onEvent = onEvent;
  }

  push(text: string): void {
    this.buffer += text;
    this.processCompleteLines();
  }

  /**
   * Call when the stream has ended. Per the spec, an event without its terminating
   * blank line is incomplete and is discarded.
   */
  end(): void {
    // A trailing lone CR is a complete line ending once the stream has ended.
    if (this.buffer.endsWith("\r")) {
      this.buffer += "\n";
      this.processCompleteLines();
    }
    this.buffer = "";
    this.resetEvent();
  }

  private processCompleteLines(): void {
    let lineStart = 0;
    for (let index = 0; index < this.buffer.length; index++) {
      const character = this.buffer[index];
      if (character !== "\n" && character !== "\r") {
        continue;
      }
      if (character === "\r" && index === this.buffer.length - 1) {
        // Could be the first half of a CRLF split across chunks; wait for more input.
        break;
      }
      this.processLine(this.buffer.slice(lineStart, index));
      if (character === "\r" && this.buffer[index + 1] === "\n") {
        index++;
      }
      lineStart = index + 1;
    }
    this.buffer = this.buffer.slice(lineStart);
  }

  private processLine(line: string): void {
    if (line === "") {
      this.dispatchEvent();
      return;
    }
    if (line.startsWith(":")) {
      return; // Comment / keep-alive.
    }

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      this.eventName = value;
    } else if (field === "data") {
      this.dataLines.push(value);
    }
  }

  private dispatchEvent(): void {
    if (this.dataLines.length > 0) {
      this.onEvent({ event: this.eventName || "message", data: this.dataLines.join("\n") });
    }
    this.resetEvent();
  }

  private resetEvent(): void {
    this.eventName = "";
    this.dataLines = [];
  }
}

/**
 * Reads a byte stream to the end, decoding UTF-8 incrementally (multi-byte
 * characters may be split across chunks) and passing each complete event to `onEvent`.
 * Cancelling the fetch's AbortSignal makes the pending read reject with an AbortError.
 */
export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: RawSseEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = new SseParser(onEvent);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Interpreting chat events
// ---------------------------------------------------------------------------

export type ParsedChatEvent =
  | { kind: "event"; value: ChatStreamEvent }
  /** An event name this client does not know. Ignored for forward compatibility. */
  | { kind: "unknown"; eventName: string }
  /** A known event whose data is not valid JSON or does not match the contract. */
  | { kind: "malformed"; eventName: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceLocation(value: unknown): value is SourceLocation {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type === "pdfPage") {
    return typeof value.page === "number" && Number.isInteger(value.page) && value.page >= 1;
  }
  if (value.type === "excelRange") {
    return typeof value.sheet === "string" && typeof value.range === "string";
  }
  return false;
}

function isCitation(value: unknown): value is Citation {
  return (
    isRecord(value) &&
    typeof value.evidenceId === "string" &&
    typeof value.documentId === "string" &&
    typeof value.fileName === "string" &&
    typeof value.snippet === "string" &&
    isSourceLocation(value.source)
  );
}

/** Validates a raw SSE event against the `POST /api/chat` event table in the contract. */
export function parseChatEvent(raw: RawSseEvent): ParsedChatEvent {
  const knownEvents = ["status", "delta", "citations", "done", "error"];
  if (!knownEvents.includes(raw.event)) {
    return { kind: "unknown", eventName: raw.event };
  }

  const malformed: ParsedChatEvent = { kind: "malformed", eventName: raw.event };
  let data: unknown;
  try {
    data = JSON.parse(raw.data);
  } catch {
    return malformed;
  }
  if (!isRecord(data)) {
    return malformed;
  }

  switch (raw.event) {
    case "status":
      if (typeof data.message === "string" && (data.tool === null || typeof data.tool === "string")) {
        return { kind: "event", value: { event: "status", data: { message: data.message, tool: data.tool } } };
      }
      return malformed;
    case "delta":
      if (typeof data.text === "string") {
        return { kind: "event", value: { event: "delta", data: { text: data.text } } };
      }
      return malformed;
    case "citations":
      if (Array.isArray(data.citations) && data.citations.every(isCitation)) {
        return { kind: "event", value: { event: "citations", data: { citations: data.citations } } };
      }
      return malformed;
    case "done":
      if (
        typeof data.messageId === "string" &&
        typeof data.answer === "string" &&
        typeof data.incomplete === "boolean"
      ) {
        return {
          kind: "event",
          value: {
            event: "done",
            data: { messageId: data.messageId, answer: data.answer, incomplete: data.incomplete },
          },
        };
      }
      return malformed;
    case "error":
      if (typeof data.code === "string" && typeof data.message === "string" && typeof data.traceId === "string") {
        return {
          kind: "event",
          value: { event: "error", data: { code: data.code, message: data.message, traceId: data.traceId } },
        };
      }
      return malformed;
    default:
      return { kind: "unknown", eventName: raw.event };
  }
}
