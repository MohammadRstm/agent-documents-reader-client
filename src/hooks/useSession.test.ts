import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { jsonResponse } from "../test/sseTestUtils";
import { SESSION_EXPIRED_NOTICE, useSession } from "./useSession";

const STORAGE_KEY = "documentsReader.sessionId";
const EXPIRED_ID = "o".repeat(43);
const NEW_ID = "n".repeat(43);

let fetchMock: Mock<typeof fetch>;

function sessionCreations() {
  return fetchMock.mock.calls.filter(([url]) => String(url) === "/api/sessions");
}

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ sessionId: NEW_ID, createdAt: "2026-10-28T12:00:00Z" }, 201));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("useSession", () => {
  it("creates a session when none is stored", async () => {
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.session).toEqual({ status: "ready", sessionId: NEW_ID }));
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(NEW_ID);
    expect(result.current.notice).toBeNull();
  });

  it("restores a stored session without creating a new one", () => {
    window.sessionStorage.setItem(STORAGE_KEY, EXPIRED_ID);

    const { result } = renderHook(() => useSession());

    expect(result.current.session).toEqual({ status: "ready", sessionId: EXPIRED_ID });
    expect(sessionCreations()).toHaveLength(0);
  });

  it("replaces an expired session once and shows the notice, even for parallel reports", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, EXPIRED_ID);
    const { result } = renderHook(() => useSession());
    const handleFromFirstRender = result.current.handleSessionNotFound;

    act(() => {
      handleFromFirstRender(EXPIRED_ID);
      handleFromFirstRender(EXPIRED_ID);
    });

    await waitFor(() => expect(result.current.session).toEqual({ status: "ready", sessionId: NEW_ID }));
    expect(sessionCreations()).toHaveLength(1);
    expect(result.current.notice).toBe(SESSION_EXPIRED_NOTICE);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(NEW_ID);

    // A late report about the old session (from a stale callback) changes nothing.
    act(() => {
      handleFromFirstRender(EXPIRED_ID);
    });
    expect(sessionCreations()).toHaveLength(1);
    expect(result.current.session).toEqual({ status: "ready", sessionId: NEW_ID });
  });

  it("can dismiss the notice", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, EXPIRED_ID);
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.handleSessionNotFound(EXPIRED_ID);
    });
    await waitFor(() => expect(result.current.notice).toBe(SESSION_EXPIRED_NOTICE));

    act(() => {
      result.current.dismissNotice();
    });
    expect(result.current.notice).toBeNull();
  });
});
