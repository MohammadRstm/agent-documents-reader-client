import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ChatMessage, Citation } from "../api/types";
import { createControlledSseStream, jsonResponse, type ControlledSseStream } from "../test/sseTestUtils";
import {
  ANSWER_CANCELLED_MESSAGE,
  DOCUMENTS_PROCESSING_MESSAGE,
  NO_DOCUMENTS_MESSAGE,
  STREAM_INTERRUPTED_MESSAGE,
  useChat,
} from "./useChat";

const SESSION_ID = "s".repeat(43);

const citation: Citation = {
  evidenceId: "E1",
  documentId: "doc-1",
  fileName: "contract.pdf",
  source: { type: "pdfPage", page: 4 },
  snippet: "Total contract value: 10,000 USD",
};

let fetchMock: Mock<typeof fetch>;
let history: ChatMessage[];
let chatResponse: Response | (() => Response);

function requestsTo(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url) === path);
}

beforeEach(() => {
  history = [];
  chatResponse = jsonResponse({ code: "internal_error", message: "Not configured.", traceId: "t" }, 500);
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "/api/chat/history") {
      return jsonResponse({ messages: history });
    }
    if (url === "/api/chat") {
      return typeof chatResponse === "function" ? chatResponse() : chatResponse;
    }
    throw new Error(`Unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderChat(onSessionNotFound = vi.fn()) {
  const hook = renderHook(() => useChat(SESSION_ID, onSessionNotFound));
  await waitFor(() => expect(hook.result.current.isHistoryLoading).toBe(false));
  return hook;
}

function startStream(): ControlledSseStream {
  const stream = createControlledSseStream();
  chatResponse = stream.response;
  return stream;
}

describe("useChat", () => {
  it("loads the conversation history for the session", async () => {
    history = [
      {
        id: "m1",
        role: "user",
        content: "Hello",
        createdAt: "2026-10-28T12:00:00Z",
        citations: [],
        incomplete: false,
      },
    ];

    const { result } = await renderChat();

    expect(result.current.messages).toEqual(history);
    const [, init] = requestsTo("/api/chat/history")[0];
    expect(new Headers(init?.headers).get("X-Session-Id")).toBe(SESSION_ID);
  });

  it("streams status and deltas into a draft, then replaces it with the final answer", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("  What is the total?  ");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.messages.at(-1)).toMatchObject({ role: "user", content: "What is the total?" });

    stream.sendEvent("status", { message: "Searching documents…", tool: "search_text" });
    await waitFor(() => expect(result.current.pendingAnswer?.status).toBe("Searching documents…"));

    stream.sendEvent("delta", { text: "The total is " });
    stream.sendEvent("delta", { text: "10,000 USD [E" });
    await waitFor(() => expect(result.current.pendingAnswer?.draft).toBe("The total is 10,000 USD [E"));

    stream.sendEvent("citations", { citations: [citation] });
    stream.sendEvent("done", { messageId: "a1", answer: "The total is 10,000 USD [E1].", incomplete: true });
    stream.close();

    await act(async () => {
      expect(await sendPromise).toBe(true);
    });

    expect(result.current.pendingAnswer).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.notice).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "The total is 10,000 USD [E1].",
      citations: [citation],
      incomplete: true,
    });

    const [, init] = requestsTo("/api/chat")[0];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Session-Id")).toBe(SESSION_ID);
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ question: "What is the total?" });
  });

  it("skips malformed and unknown events and keeps streaming", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("Question");
    });

    stream.sendRaw('event: delta\ndata: {"text": broken\n\n');
    stream.sendEvent("delta", { text: 42 });
    stream.sendEvent("heartbeat", {});
    stream.sendEvent("delta", { text: "Valid text" });
    await waitFor(() => expect(result.current.pendingAnswer?.draft).toBe("Valid text"));

    stream.sendEvent("done", { messageId: "a1", answer: "Final answer", incomplete: false });
    stream.close();
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.notice).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({ id: "a1", content: "Final answer", citations: [] });
  });

  it("shows the message from an error event and keeps the question", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("Question");
    });
    stream.sendEvent("delta", { text: "Partial" });
    stream.sendEvent("error", {
      code: "provider_unavailable",
      message: "The AI provider is unavailable. Please try again.",
      traceId: "t1",
    });
    stream.close();
    await act(async () => {
      expect(await sendPromise).toBe(true);
    });

    expect(result.current.notice).toEqual({
      variant: "error",
      message: "The AI provider is unavailable. Please try again.",
    });
    expect(result.current.pendingAnswer).toBeNull();
    expect(result.current.messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("shows a generic error when the stream ends without done or error", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("Question");
    });
    stream.sendEvent("delta", { text: "Partial" });
    stream.close();
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.notice).toEqual({ variant: "error", message: STREAM_INTERRUPTED_MESSAGE });
    expect(result.current.pendingAnswer).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("handles a pre-stream question_in_progress error by removing the question", async () => {
    chatResponse = jsonResponse(
      { code: "question_in_progress", message: "Another question is still being answered.", traceId: "t" },
      409,
    );
    const { result } = await renderChat();

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.send("Question");
    });

    expect(accepted).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.notice).toEqual({
      variant: "error",
      message: "Another question is still being answered.",
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it("reports a pre-stream session_not_found to the session owner", async () => {
    chatResponse = jsonResponse({ code: "session_not_found", message: "Session expired.", traceId: "t" }, 404);
    const onSessionNotFound = vi.fn();
    const { result } = await renderChat(onSessionNotFound);

    await act(async () => {
      await result.current.send("Question");
    });

    expect(onSessionNotFound).toHaveBeenCalledWith(SESSION_ID);
  });

  it("rejects empty questions without calling the server", async () => {
    const { result } = await renderChat();

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.send("   ");
    });

    expect(accepted).toBe(false);
    expect(requestsTo("/api/chat")).toHaveLength(0);
  });

  it("cancels a streaming answer and ignores later events", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("Question");
    });
    stream.sendEvent("delta", { text: "Partial" });
    await waitFor(() => expect(result.current.pendingAnswer?.draft).toBe("Partial"));

    act(() => {
      result.current.cancel();
    });
    stream.sendEvent("done", { messageId: "a1", answer: "Too late", incomplete: false });
    stream.close();
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.pendingAnswer).toBeNull();
    expect(result.current.notice).toEqual({ variant: "notice", message: ANSWER_CANCELLED_MESSAGE });
    expect(result.current.messages.some((message) => message.role === "assistant")).toBe(false);
  });

  it("does not send a second question while one is streaming", async () => {
    const stream = startStream();
    const { result } = await renderChat();

    let firstSend!: Promise<boolean>;
    act(() => {
      firstSend = result.current.send("First");
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    let secondAccepted: boolean | undefined;
    await act(async () => {
      secondAccepted = await result.current.send("Second");
    });
    expect(secondAccepted).toBe(false);
    expect(requestsTo("/api/chat")).toHaveLength(1);

    stream.sendEvent("done", { messageId: "a1", answer: "Answer", incomplete: false });
    stream.close();
    await act(async () => {
      await firstSend;
    });
  });

  it.each([
    ["documents_processing", "Documents are still processing.", DOCUMENTS_PROCESSING_MESSAGE],
    ["no_documents", "No readable documents.", NO_DOCUMENTS_MESSAGE],
  ])("shows a friendly message for a pre-stream 409 %s and returns the question", async (code, serverMessage, expected) => {
    chatResponse = jsonResponse({ code, message: serverMessage, traceId: "t" }, 409);
    const { result } = await renderChat();

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.send("What is the total?");
    });

    expect(accepted).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.notice).toEqual({ variant: "error", message: expected });
    expect(result.current.isStreaming).toBe(false);
  });
});
