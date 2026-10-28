import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, getUserFacingErrorMessage, isValidSessionId } from "../api/client";

const SESSION_STORAGE_KEY = "documentsReader.sessionId";

export const SESSION_EXPIRED_NOTICE =
  "Your previous session has expired, so its documents and chat history are no longer available. A new session has been started.";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; sessionId: string }
  | { status: "error"; message: string };

export interface UseSessionResult {
  session: SessionState;
  /** Informational message for the user, for example after a session expired. */
  notice: string | null;
  dismissNotice: () => void;
  /** Tries to create a session again after a failure. */
  retry: () => void;
  /**
   * Call when the server answers `session_not_found` for `expiredSessionId`.
   * Starts a new session (once, even if several requests fail at the same time).
   */
  handleSessionNotFound: (expiredSessionId: string) => void;
}

// sessionStorage can throw when storage is blocked by the browser. The app still
// works in that case; the session just does not survive a page reload.
function readStoredSessionId(): string | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return isValidSessionId(value) ? value : null;
  } catch {
    return null;
  }
}

function storeSessionId(sessionId: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // See readStoredSessionId.
  }
}

function clearStoredSessionId(): void {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // See readStoredSessionId.
  }
}

/** Owns the session ID: restores it from sessionStorage or creates a new one. */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionState>(() => {
    const storedSessionId = readStoredSessionId();
    return storedSessionId ? { status: "ready", sessionId: storedSessionId } : { status: "loading" };
  });
  const [notice, setNotice] = useState<string | null>(null);
  // Prevents duplicate sessions (React StrictMode double effects, parallel expiry reports).
  const isCreatingRef = useRef(false);
  // The active session ID, updated synchronously so expiry reports never compare against
  // a stale render's value (callers may hold an older handleSessionNotFound).
  const activeSessionIdRef = useRef<string | null>(session.status === "ready" ? session.sessionId : null);

  const startNewSession = useCallback(() => {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;
    activeSessionIdRef.current = null;
    setSession({ status: "loading" });
    createSession()
      .then(({ sessionId }) => {
        storeSessionId(sessionId);
        activeSessionIdRef.current = sessionId;
        setSession({ status: "ready", sessionId });
      })
      .catch((error: unknown) => {
        setSession({ status: "error", message: getUserFacingErrorMessage(error) });
      })
      .finally(() => {
        isCreatingRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (readStoredSessionId() === null) {
      startNewSession();
    }
  }, [startNewSession]);

  const handleSessionNotFound = useCallback(
    (expiredSessionId: string) => {
      // Ignore reports about a session that has already been replaced (this also makes
      // parallel reports for the same session produce a single notice and new session).
      if (activeSessionIdRef.current !== expiredSessionId) {
        return;
      }
      clearStoredSessionId();
      setNotice(SESSION_EXPIRED_NOTICE);
      startNewSession();
    },
    [startNewSession],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { session, notice, dismissNotice, retry: startNewSession, handleSessionNotFound };
}
