import type { SourceLocation } from "../api/types";

/** Human-readable location, e.g. "Page 3" or "Sheet BOQ, range A5:F5". */
export function formatSourceLocation(source: SourceLocation): string {
  if (source.type === "pdfPage") {
    return `Page ${source.page}`;
  }
  return `Sheet ${source.sheet}, range ${source.range}`;
}
