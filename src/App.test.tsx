import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "./App";
import { jsonResponse } from "./test/sseTestUtils";

const STORAGE_KEY = "documentsReader.sessionId";
const EXPIRED_ID = "o".repeat(43);
const NEW_ID = "n".repeat(43);

let fetchMock: Mock<typeof fetch>;

function callsTo(method: string, path: string) {
  return fetchMock.mock.calls.filter(([url, init]) => String(url) === path && (init?.method ?? "GET") === method);
}

beforeEach(() => {
  window.sessionStorage.clear();
  // Behaves like a server that was restarted: only NEW_ID exists. The mock ignores
  // AbortSignals, so requests cancelled by StrictMode's double effects still resolve,
  // like a fast server answering before the cancellation.
  fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/sessions") {
      return jsonResponse({ sessionId: NEW_ID, createdAt: "2026-10-28T12:00:00Z" }, 201);
    }
    if (new Headers(init?.headers).get("X-Session-Id") !== NEW_ID) {
      return jsonResponse({ code: "session_not_found", message: "Session not found.", traceId: "t" }, 404);
    }
    if (url === "/api/documents") {
      return jsonResponse({ documents: [] });
    }
    if (url === "/api/chat/history") {
      return jsonResponse({ messages: [] });
    }
    throw new Error(`Unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("App session expiry", () => {
  it("tells the user when the stored session has expired and starts exactly one new session", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, EXPIRED_ID);

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText(/previous session has expired/i)).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(NEW_ID));
    await waitFor(() => expect(callsTo("GET", "/api/chat/history").length).toBeGreaterThan(0));
    await screen.findByText("No documents uploaded yet.");

    expect(callsTo("POST", "/api/sessions")).toHaveLength(1);
    expect(screen.getAllByText(/previous session has expired/i)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show the notice for a normal first visit", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await screen.findByText("No documents uploaded yet.");
    expect(callsTo("POST", "/api/sessions")).toHaveLength(1);
    expect(screen.queryByText(/previous session has expired/i)).not.toBeInTheDocument();
  });
});
