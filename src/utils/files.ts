/**
 * File extensions the upload panel offers. This check only improves the user
 * experience; the server validates signatures and content and is the authority.
 */
export const SUPPORTED_FILE_EXTENSIONS = [".pdf", ".xlsx", ".xlsm", ".xls"] as const;

export function hasSupportedExtension(fileName: string): boolean {
  const lowerCaseName = fileName.toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension));
}

export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Unknown size";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
