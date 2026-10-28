import { useCallback, useEffect, useRef, useState } from "react";
import { getEvidence, getUserFacingErrorMessage, isAbortError, isApiError } from "../api/client";
import type { EvidenceDetail } from "../api/types";

export type EvidenceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; evidence: EvidenceDetail }
  | { status: "error"; message: string };

/** Loads the full text of one evidence item (`GET /api/evidence/{id}`) for the source panel. */
export function useEvidence(
  sessionId: string | null,
  evidenceId: string | null,
  onSessionNotFound: (sessionId: string) => void,
): { state: EvidenceState; retry: () => void } {
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<EvidenceState>(
    sessionId !== null && evidenceId !== null ? { status: "loading" } : { status: "idle" },
  );

  const onSessionNotFoundRef = useRef(onSessionNotFound);
  useEffect(() => {
    onSessionNotFoundRef.current = onSessionNotFound;
  }, [onSessionNotFound]);

  // Reset while rendering when the requested evidence changes.
  const [loadedFor, setLoadedFor] = useState({ sessionId, evidenceId, reloadCount });
  if (
    loadedFor.sessionId !== sessionId ||
    loadedFor.evidenceId !== evidenceId ||
    loadedFor.reloadCount !== reloadCount
  ) {
    setLoadedFor({ sessionId, evidenceId, reloadCount });
    setState(sessionId !== null && evidenceId !== null ? { status: "loading" } : { status: "idle" });
  }

  useEffect(() => {
    if (sessionId === null || evidenceId === null) {
      return;
    }
    const controller = new AbortController();
    getEvidence(sessionId, evidenceId, controller.signal)
      .then((evidence) => setState({ status: "loaded", evidence }))
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        if (isApiError(error) && error.code === "session_not_found") {
          onSessionNotFoundRef.current(sessionId);
          return;
        }
        setState({ status: "error", message: getUserFacingErrorMessage(error) });
      });
    return () => controller.abort();
  }, [sessionId, evidenceId, reloadCount]);

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);

  return { state, retry };
}
