import { useCallback, useEffect, useRef, useState } from "react";
import {
  getUserFacingErrorMessage,
  isAbortError,
  isApiError,
  listDocuments,
  uploadDocument,
} from "../api/client";
import type { DocumentStatus, DocumentSummary } from "../api/types";

/**
 * One file sent with its own `POST /api/documents` request.
 * - `uploading`: bytes are being sent; `progress` is 0 to 1.
 * - `processing`: all bytes sent, waiting for the server to parse the file.
 * - `failed`: the request failed as a whole; `error` is a safe message.
 * A successful upload is removed from the list and its document appears in `documents`.
 */
export interface FileUpload {
  id: string;
  fileName: string;
  sizeBytes: number;
  phase: "uploading" | "processing" | "failed";
  progress: number;
  error: string | null;
}

/** Statuses whose content can be searched, so questions can be asked about them. */
const READABLE_STATUSES: readonly DocumentStatus[] = ["indexed", "partiallyIndexed"];

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  isLoading: boolean;
  /** Safe message when the document list could not be loaded. */
  loadError: string | null;
  reload: () => void;
  uploads: FileUpload[];
  /** Number of files still uploading or being processed by the server. */
  processingCount: number;
  /** True when at least one document is indexed or partially indexed. */
  hasReadableDocuments: boolean;
  /** Starts one upload request per file, all in parallel. */
  upload: (files: File[]) => void;
  /** Removes a failed upload row. */
  dismissUpload: (uploadId: string) => void;
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
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const uploadCountRef = useRef(0);

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
      // Documents and uploads of a different session must never be shown.
      setDocuments([]);
      setUploads([]);
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
        if (controller.signal.aborted || isAbortError(error)) {
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

  // Abort in-flight uploads when the session changes or the component unmounts.
  useEffect(() => {
    const controllers = uploadControllersRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, [sessionId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const dismissUpload = useCallback((uploadId: string) => {
    setUploads((current) => current.filter((item) => item.id !== uploadId || item.phase !== "failed"));
  }, []);

  const upload = useCallback(
    (files: File[]) => {
      if (sessionId === null) {
        return;
      }
      for (const file of files) {
        uploadCountRef.current += 1;
        const uploadId = `upload-${uploadCountRef.current}`;
        const controller = new AbortController();
        uploadControllersRef.current.set(uploadId, controller);

        const updateUpload = (changes: Partial<FileUpload>) =>
          setUploads((current) => current.map((item) => (item.id === uploadId ? { ...item, ...changes } : item)));

        setUploads((current) => [
          ...current,
          { id: uploadId, fileName: file.name, sizeBytes: file.size, phase: "uploading", progress: 0, error: null },
        ]);

        uploadDocument(sessionId, file, {
          signal: controller.signal,
          onUploadProgress: (fraction) =>
            updateUpload(fraction >= 1 ? { phase: "processing", progress: 1 } : { progress: fraction }),
        })
          .then((document) => {
            if (controller.signal.aborted) {
              return;
            }
            setUploads((current) => current.filter((item) => item.id !== uploadId));
            setDocuments((current) => mergeDocuments(current, [document]));
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || isAbortError(error)) {
              return;
            }
            if (isSessionNotFound(error)) {
              // The session reset clears this row along with the old session's state.
              onSessionNotFoundRef.current(sessionId);
              return;
            }
            updateUpload({ phase: "failed", error: getUserFacingErrorMessage(error) });
          })
          .finally(() => {
            uploadControllersRef.current.delete(uploadId);
          });
      }
    },
    [sessionId],
  );

  return {
    documents,
    isLoading,
    loadError,
    reload,
    uploads,
    processingCount: uploads.filter((item) => item.phase !== "failed").length,
    hasReadableDocuments: documents.some((document) => READABLE_STATUSES.includes(document.status)),
    upload,
    dismissUpload,
  };
}
