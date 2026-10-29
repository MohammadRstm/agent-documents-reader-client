import { useCallback, useEffect, useRef, useState } from "react";
import {
  getUserFacingErrorMessage,
  isAbortError,
  isApiError,
  listDocuments,
  uploadDocuments,
} from "../api/client";
import type { DocumentSummary } from "../api/types";

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  isLoading: boolean;
  /** Safe message when the document list could not be loaded. */
  loadError: string | null;
  reload: () => void;
  isUploading: boolean;
  /** Safe message when the last upload request failed as a whole. */
  uploadError: string | null;
  dismissUploadError: () => void;
  upload: (files: File[]) => Promise<void>;
}

/** Appends documents that are not already present, keeping the existing order. */
function mergeDocuments(existing: DocumentSummary[], incoming: DocumentSummary[]): DocumentSummary[] {
  const knownIds = new Set(existing.map((document) => document.id));
  return [...existing, ...incoming.filter((document) => !knownIds.has(document.id))];
}

function isSessionNotFound(error: unknown): boolean {
  return isApiError(error) && error.code === "session_not_found";
}

/**
 * Loads and uploads the documents of the current session.
 * `sessionId` is null while no session is available.
 */
export function useDocuments(
  sessionId: string | null,
  onSessionNotFound: (sessionId: string) => void,
): UseDocumentsResult {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(sessionId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);

  // Kept in a ref so a new callback identity does not trigger a reload.
  const onSessionNotFoundRef = useRef(onSessionNotFound);
  useEffect(() => {
    onSessionNotFoundRef.current = onSessionNotFound;
  }, [onSessionNotFound]);

  // Reset state while rendering when the session changes or a reload is requested
  // (React's recommended alternative to resetting state inside an effect).
  const [loadedFor, setLoadedFor] = useState({ sessionId, reloadCount });
  if (loadedFor.sessionId !== sessionId || loadedFor.reloadCount !== reloadCount) {
    setLoadedFor({ sessionId, reloadCount });
    setIsLoading(sessionId !== null);
    setLoadError(null);
    if (loadedFor.sessionId !== sessionId) {
      // Documents of a different session must never be shown.
      setDocuments([]);
      setIsUploading(false);
      setUploadError(null);
    }
  }

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    const controller = new AbortController();
    listDocuments(sessionId, controller.signal)
      .then((response) => {
        // Keep anything uploaded while the list was loading.
        setDocuments((current) => mergeDocuments(response.documents, current));
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        setIsLoading(false);
        if (isSessionNotFound(error)) {
          onSessionNotFoundRef.current(sessionId);
          return;
        }
        setLoadError(getUserFacingErrorMessage(error));
      });

    return () => controller.abort();
  }, [sessionId, reloadCount]);

  // Abort an in-flight upload when the session changes or the component unmounts.
  useEffect(
    () => () => {
      uploadControllerRef.current?.abort();
      uploadControllerRef.current = null;
    },
    [sessionId],
  );

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const dismissUploadError = useCallback(() => setUploadError(null), []);

  const upload = useCallback(
    async (files: File[]) => {
      if (sessionId === null || files.length === 0 || uploadControllerRef.current !== null) {
        return;
      }
      const controller = new AbortController();
      uploadControllerRef.current = controller;
      setIsUploading(true);
      setUploadError(null);

      try {
        const response = await uploadDocuments(sessionId, files, controller.signal);
        setDocuments((current) => mergeDocuments(current, response.documents));
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        if (isSessionNotFound(error)) {
          onSessionNotFoundRef.current(sessionId);
          return;
        }
        setUploadError(getUserFacingErrorMessage(error));
      } finally {
        // When the session changed meanwhile, the session reset already cleared this state.
        if (uploadControllerRef.current === controller) {
          uploadControllerRef.current = null;
          setIsUploading(false);
        }
      }
    },
    [sessionId],
  );

  return {
    documents,
    isLoading,
    loadError,
    reload,
    isUploading,
    uploadError,
    dismissUploadError,
    upload,
  };
}
