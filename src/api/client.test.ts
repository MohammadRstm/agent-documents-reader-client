// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  ApiError,
  createSession,
  getChatHistory,
  getUserFacingErrorMessage,
  isAbortError,
  listDocuments,
  streamChat,
  uploadDocuments,
} from "./client";
import type { ChatStreamEvent } from "./types";

const SESSION_ID = "a".repeat(43);

let fetchMock: Mock<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init ?? {} };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session header", () => {
  it("sends X-Session-Id on session-scoped requests", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [] }));

    await listDocuments(SESSION_ID);

    const { url, init } = lastRequest();
    expect(url).toBe("/api/documents");
    expect(new Headers(init.headers).get("X-Session-Id")).toBe(SESSION_ID);
  });

  it("does not send X-Session-Id when creating a session", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sessionId: SESSION_ID, createdAt: "2026-10-28T12:00:00Z" }, 201));

    const result = await createSession();

    const { url, init } = lastRequest();
    expect(url).toBe("/api/sessions");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("X-Session-Id")).toBe(false);
    expect(result.sessionId).toBe(SESSION_ID);
  });

  it("rejects a created session whose ID does not match the contract format", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sessionId: "../not-valid", createdAt: "2026-10-28T12:00:00Z" }, 201));

    const error = await captureError(createSession());

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("unexpected_response");
  });
});

describe("uploadDocuments", () => {
  it("posts every file as a 'files' part without a manual Content-Type header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [] }));
    const files = [
      new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" }),
      new File(["data"], "boq.xlsx"),
    ];

    await uploadDocuments(SESSION_ID, files);

    const { url, init } = lastRequest();
    expect(url).toBe("/api/documents");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Session-Id")).toBe(SESSION_ID);
    expect(headers.has("Content-Type")).toBe(false);
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.getAll("files") as File[]).map((file) => file.name)).toEqual(["contract.pdf", "boq.xlsx"]);
  });
});

describe("error parsing", () => {
  it("parses the contract error body into a typed ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: "validation_failed",
          message: "The request is invalid.",
          traceId: "00-abc",
          details: { question: ["Question must not be empty."] },
        },
        400,
      ),
    );

    const error = await captureError(listDocuments(SESSION_ID));

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe("validation_failed");
    expect(apiError.message).toBe("The request is invalid.");
    expect(apiError.traceId).toBe("00-abc");
    expect(apiError.details).toEqual({ question: ["Question must not be empty."] });
  });

  it("recognises session_not_found", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "session_not_found", message: "Session not found.", traceId: "00-def" }, 404),
    );

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.code).toBe("session_not_found");
    expect(error.status).toBe(404);
    expect(error.details).toBeNull();
  });

  it("uses a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><body>System.Exception at C:\\server\\Program.cs</body></html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.code).toBe("unexpected_response");
    expect(error.status).toBe(500);
    expect(error.message).not.toContain("Exception");
    expect(error.message).not.toContain("Program.cs");
  });

  it("does not trust JSON error bodies with an unknown code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: "weird", message: "Stack trace here", traceId: "x" }, 500));

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.code).toBe("unexpected_response");
    expect(error.message).not.toContain("Stack trace");
  });

  it("uses a rate-limit message for 429 responses without a contract body", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.status).toBe(429);
    expect(error.message).toMatch(/too many requests/i);
  });

  it("reports network failures as network_error without exposing the original error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:5080"));

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.code).toBe("network_error");
    expect(error.status).toBe(0);
    expect(error.message).not.toContain("ECONNREFUSED");
  });

  it("reports a successful response with an invalid body as unexpected_response", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));

    const error = (await captureError(listDocuments(SESSION_ID))) as ApiError;

    expect(error.code).toBe("unexpected_response");
  });

  it("rethrows abort errors unchanged", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    const error = await captureError(listDocuments(SESSION_ID));

    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("getUserFacingErrorMessage", () => {
  it("returns a generic message for errors that are not ApiErrors", () => {
    expect(getUserFacingErrorMessage(new Error("NullReferenceException in Foo.Bar"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("streamChat", () => {
  function eventStreamResponse(text: string, contentType = "text/event-stream"): Response {
    return new Response(text, { status: 200, headers: { "Content-Type": contentType } });
  }

  it("posts the question as JSON with the session header", async () => {
    fetchMock.mockResolvedValue(
      eventStreamResponse('event: done\ndata: {"messageId":"m1","answer":"Hi","incomplete":false}\n\n'),
    );

    await streamChat(SESSION_ID, "What is the total?", () => {});

    const { url, init } = lastRequest();
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Session-Id")).toBe(SESSION_ID);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ question: "What is the total?" });
  });

  it("passes valid events in order and skips malformed and unknown ones", async () => {
    fetchMock.mockResolvedValue(
      eventStreamResponse(
        [
          'event: status\ndata: {"message":"Searching documents…","tool":"search_text"}\n\n',
          'event: delta\ndata: {"text":\n\n',
          "event: ping\ndata: {}\n\n",
          'event: delta\ndata: {"text":"Hello"}\n\n',
          'event: done\ndata: {"messageId":"m1","answer":"Hello","incomplete":false}\n\n',
        ].join(""),
      ),
    );
    const events: ChatStreamEvent[] = [];

    await streamChat(SESSION_ID, "Hi", (event) => events.push(event));

    expect(events.map((event) => event.event)).toEqual(["status", "delta", "done"]);
  });

  it("throws the contract error when the request is rejected before streaming", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "question_in_progress", message: "Please wait for the current answer.", traceId: "t" }, 409),
    );

    const error = (await captureError(streamChat(SESSION_ID, "Hi", () => {}))) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("question_in_progress");
    expect(error.message).toBe("Please wait for the current answer.");
  });

  it("rejects a successful response that is not an event stream", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ answer: "Hi" }));

    const error = (await captureError(streamChat(SESSION_ID, "Hi", () => {}))) as ApiError;

    expect(error.code).toBe("unexpected_response");
  });
});

describe("getChatHistory", () => {
  it("returns the messages for the session", async () => {
    const messages = [
      { id: "m1", role: "user", content: "Hi", createdAt: "2026-10-28T12:00:00Z", citations: [], incomplete: false },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ messages }));

    const result = await getChatHistory(SESSION_ID);

    expect(result.messages).toEqual(messages);
    expect(lastRequest().url).toBe("/api/chat/history");
    expect(new Headers(lastRequest().init.headers).get("X-Session-Id")).toBe(SESSION_ID);
  });
});
