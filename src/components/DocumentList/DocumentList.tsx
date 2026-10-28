import type { DocumentStatus, DocumentSummary, FileType } from "../../api/types";
import { formatFileSize } from "../../utils/files";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import styles from "./DocumentList.module.css";

interface DocumentListProps {
  documents: DocumentSummary[];
  isLoading: boolean;
  /** Safe message when the list could not be loaded. */
  error: string | null;
  onRetry: () => void;
}

type StatusTone = "success" | "warning" | "failure";

const STATUS_DISPLAY: Record<DocumentStatus, { label: string; tone: StatusTone; description: string | null }> = {
  indexed: { label: "Indexed", tone: "success", description: null },
  partiallyIndexed: {
    label: "Partially indexed",
    tone: "warning",
    description: "Some content could not be read. Answers may not cover the whole document.",
  },
  noTextExtracted: {
    label: "No text found",
    tone: "warning",
    description: "No readable text was found. The PDF may be scanned; its content cannot be searched.",
  },
  empty: { label: "Empty", tone: "warning", description: "The file contains no content." },
  unsupported: {
    label: "Unsupported",
    tone: "failure",
    description: "This file is not a supported PDF or Excel document.",
  },
  corrupt: {
    label: "Unreadable",
    tone: "failure",
    description: "The file is damaged, encrypted, or could not be opened.",
  },
  tooLarge: { label: "Too large", tone: "failure", description: "The file exceeds the maximum allowed size." },
};

const UNKNOWN_STATUS = { label: "Unknown status", tone: "warning" as const, description: null };

const FILE_TYPE_LABELS: Record<FileType, string> = {
  pdf: "PDF",
  xlsx: "Excel (.xlsx)",
  xlsm: "Excel (.xlsm)",
  xls: "Excel (.xls)",
  unknown: "Unknown type",
};

function describeContents(document: DocumentSummary): string | null {
  if (document.pageCount !== null) {
    return document.pageCount === 1 ? "1 page" : `${document.pageCount} pages`;
  }
  if (document.sheets !== null && document.sheets.length > 0) {
    const sheetCount = document.sheets.length === 1 ? "1 sheet" : `${document.sheets.length} sheets`;
    return `${sheetCount}: ${document.sheets.map((sheet) => sheet.name).join(", ")}`;
  }
  return null;
}

function DocumentItem({ document }: { document: DocumentSummary }) {
  // Fallbacks guard against values outside the contract instead of crashing the list.
  const status = STATUS_DISPLAY[document.status] ?? UNKNOWN_STATUS;
  const details = [FILE_TYPE_LABELS[document.fileType] ?? FILE_TYPE_LABELS.unknown,formatFileSize(document.sizeBytes), describeContents(document)]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <span className={styles.fileName} title={document.fileName}>
          {document.fileName}
        </span>
        <span className={`${styles.badge} ${styles[status.tone]}`}>{status.label}</span>
      </div>
      <p className={styles.details}>{details}</p>
      {status.description && <p className={styles.statusDescription}>{status.description}</p>}
      {document.warnings.length > 0 && (
        <ul className={styles.warnings} aria-label={`Warnings for ${document.fileName}`}>
          {document.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function DocumentList({ documents, isLoading, error, onRetry }: DocumentListProps) {
  let content;
  if (isLoading) {
    content = (
      <p className={styles.placeholder} role="status">
        Loading documents…
      </p>
    );
  } else if (error) {
    content = <ErrorBanner message={error} onRetry={onRetry} />;
  } else if (documents.length === 0) {
    content = <p className={styles.placeholder}>No documents uploaded yet.</p>;
  } else {
    content = (
      <ul className={styles.list} aria-label="Uploaded documents">
        {documents.map((document) => (
          <DocumentItem key={document.id} document={document} />
        ))}
      </ul>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="documents-heading">
      <h2 id="documents-heading" className={styles.heading}>
        Documents
      </h2>
      {content}
    </section>
  );
}
