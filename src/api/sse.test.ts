// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SseParser, parseChatEvent, readSseStream, type RawSseEvent } from "./sse";

function parseChunks(chunks: string[], { endStream = true } = {}): RawSseEvent[] {
  const events: RawSseEvent[] = [];
  const parser = new SseParser((event) => events.push(event));
  for (const chunk of chunks) {
    parser.push(chunk);
  }
  if (endStream) {
    parser.end();
  }
  return events;
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

const STATUS_EVENT = 'event: status\ndata: {"message":"Searching documents…","tool":"search_text"}\n\n';
const DELTA_EVENT = 'event: delta\ndata: {"text":"The total is "}\n\n';
const DONE_EVENT = 'event: done\ndata: {"messageId":"m1","answer":"The total is 10 [E1].","incomplete":false}\n\n';

describe("SseParser", () => {
  it("parses a single complete event", () => {
    expect(parseChunks([DELTA_EVENT])).toEqual([{ event: "delta", data: '{"text":"The total is "}' }]);
  });

  it("parses multiple events delivered in one chunk", () => {
    const events = parseChunks([STATUS_EVENT + DELTA_EVENT + DONE_EVENT]);

    expect(events.map((event) => event.event)).toEqual(["status", "delta", "done"]);
  });

  it("produces the same events however the stream is split into chunks", () => {
    const text = STATUS_EVENT + DELTA_EVENT + DONE_EVENT;
    const expected = parseChunks([text]);

    // Split at every possible position into two chunks...
    for (let splitAt = 1; splitAt < text.length; splitAt++) {
      expect(parseChunks([text.slice(0, splitAt), text.slice(splitAt)])).toEqual(expected);
    }
    // ...and deliver it one character at a time.
    expect(parseChunks(text.split(""))).toEqual(expected);
  });

  it("handles CRLF and CR line endings, including a CRLF split across chunks", () => {
    const crlf = 'event: delta\r\ndata: {"text":"a"}\r\n\r\n';
    const cr = 'event: delta\rdata: {"text":"b"}\r\r';

    expect(parseChunks([crlf, cr]).map((event) => event.data)).toEqual(['{"text":"a"}', '{"text":"b"}']);
    expect(parseChunks(['event: delta\r', '\ndata: {"text":"c"}\r', "\n\r", "\n"])).toEqual([
      { event: "delta", data: '{"text":"c"}' },
    ]);
  });

  it("ignores comment lines and unknown fields", () => {
    const events = parseChunks([': keep-alive\n\nid: 7\nretry: 1000\nevent: delta\ndata: {"text":"x"}\n\n']);

    expect(events).toEqual([{ event: "delta", data: '{"text":"x"}' }]);
  });

  it("joins multiple data lines with a newline", () => {
    expect(parseChunks(["event: delta\ndata: line one\ndata: line two\n\n"])).toEqual([
      { event: "delta", data: "line one\nline two" },
    ]);
  });

  it("removes only one leading space after the colon", () => {
    expect(parseChunks(["event:delta\ndata:  two spaces\n\n"])).toEqual([{ event: "delta", data: " two spaces" }]);
  });

  it("defaults the event name to 'message' and skips events without data", () => {
    expect(parseChunks(["event: status\n\ndata: plain\n\n"])).toEqual([{ event: "message", data: "plain" }]);
  });

  it("discards an incomplete event at the end of the stream", () => {
    expect(parseChunks([DELTA_EVENT + 'event: done\ndata: {"messageId":"m1"}'])).toEqual([
      { event: "delta", data: '{"text":"The total is "}' },
    ]);
  });

  it("does not dispatch an event before its terminating blank line arrives", () => {
    expect(parseChunks(['event: delta\ndata: {"text":"x"}\n'], { endStream: false })).toEqual([]);
  });
});

describe("readSseStream", () => {
  it("decodes UTF-8 characters split across byte chunks", async () => {
    const bytes = new TextEncoder().encode(STATUS_EVENT);
    // "…" is three bytes in UTF-8; split inside it.
    const ellipsisStart = bytes.indexOf(0xe2);
    const chunks = [bytes.slice(0, ellipsisStart + 1), bytes.slice(ellipsisStart + 1)];
    const events: RawSseEvent[] = [];

    await readSseStream(streamOf(chunks), (event) => events.push(event));

    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].data).message).toBe("Searching documents…");
  });

  it("delivers every event from a multi-chunk stream", async () => {
    const encoder = new TextEncoder();
    const events: RawSseEvent[] = [];

    await readSseStream(
      streamOf([encoder.encode(STATUS_EVENT.slice(0, 10)), encoder.encode(STATUS_EVENT.slice(10) + DONE_EVENT)]),
      (event) => events.push(event),
    );

    expect(events.map((event) => event.event)).toEqual(["status", "done"]);
  });
});

describe("parseChatEvent", () => {
  it("parses each contract event type", () => {
    expect(parseChatEvent({ event: "status", data: '{"message":"Searching","tool":null}' })).toEqual({
      kind: "event",
      value: { event: "status", data: { message: "Searching", tool: null } },
    });
    expect(parseChatEvent({ event: "delta", data: '{"text":"Hi"}' })).toEqual({
      kind: "event",
      value: { event: "delta", data: { text: "Hi" } },
    });
    expect(
      parseChatEvent({ event: "done", data: '{"messageId":"m1","answer":"Total [E1]","incomplete":true}' }),
    ).toEqual({
      kind: "event",
      value: { event: "done", data: { messageId: "m1", answer: "Total [E1]", incomplete: true } },
    });
    expect(
      parseChatEvent({ event: "error", data: '{"code":"provider_unavailable","message":"Try later.","traceId":"t"}' }),
    ).toEqual({
      kind: "event",
      value: { event: "error", data: { code: "provider_unavailable", message: "Try later.", traceId: "t" } },
    });
  });

  it("parses citations with PDF and Excel sources", () => {
    const citations = [
      { evidenceId: "E1", documentId: "d1", fileName: "a.pdf", source: { type: "pdfPage", page: 3 }, snippet: "x" },
      {
        evidenceId: "E2",
        documentId: "d2",
        fileName: "b.xlsx",
        source: { type: "excelRange", sheet: "BOQ", range: "A5:F5" },
        snippet: "y",
      },
    ];

    expect(parseChatEvent({ event: "citations", data: JSON.stringify({ citations }) })).toEqual({
      kind: "event",
      value: { event: "citations", data: { citations } },
    });
  });

  it("reports malformed JSON as malformed", () => {
    expect(parseChatEvent({ event: "delta", data: '{"text": "unterminated' })).toEqual({
      kind: "malformed",
      eventName: "delta",
    });
  });

  it("reports data that does not match the contract as malformed", () => {
    expect(parseChatEvent({ event: "delta", data: '{"text": 42}' }).kind).toBe("malformed");
    expect(parseChatEvent({ event: "done", data: '{"messageId":"m1","answer":"x"}' }).kind).toBe("malformed");
    expect(parseChatEvent({ event: "status", data: '"just a string"' }).kind).toBe("malformed");
    expect(parseChatEvent({ event: "delta", data: "null" }).kind).toBe("malformed");
    expect(
      parseChatEvent({
        event: "citations",
        data: JSON.stringify({
          citations: [{ evidenceId: "E1", documentId: "d", fileName: "f", snippet: "s", source: { type: "pdfPage", page: 0 } }],
        }),
      }).kind,
    ).toBe("malformed");
  });

  it("ignores unknown event names", () => {
    expect(parseChatEvent({ event: "ping", data: "{}" })).toEqual({ kind: "unknown", eventName: "ping" });
  });
});
