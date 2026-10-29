export interface ChatGatingInput {
  /** Files still uploading or being processed by the server. */
  processingCount: number;
  /** At least one document is indexed or partially indexed. */
  hasReadableDocuments: boolean;
  /** The document list is still loading. */
  isLoadingDocuments: boolean;
}

/**
 * Returns why asking is not possible yet, or null when questions can be sent.
 * This only improves the experience: the server rejects such questions with
 * `documents_processing` or `no_documents` regardless.
 */
export function getChatBlockedReason({
  processingCount,
  hasReadableDocuments,
  isLoadingDocuments,
}: ChatGatingInput): string | null {
  if (processingCount > 0) {
    const files = processingCount === 1 ? "1 file" : `${processingCount} files`;
    return `Processing ${files}… you can ask once processing finishes.`;
  }
  if (isLoadingDocuments) {
    return "Loading documents…";
  }
  if (!hasReadableDocuments) {
    return "Upload at least one readable PDF or Excel file to start asking.";
  }
  return null;
}
