import { useEffect } from "react";
import type { Citation } from "../../api/types";
import type { EvidenceState } from "../../hooks/useEvidence";
import { formatSourceLocation } from "../../utils/citations";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import styles from "./SourcePanel.module.css";

interface SourcePanelProps {
  citation: Citation;
  evidence: EvidenceState;
  onRetry: () => void;
  onClose: () => void;
}

export function SourcePanel({ citation, evidence, onRetry, onClose }: SourcePanelProps) {
  // Close with the Escape key.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside className={styles.panel} aria-labelledby="source-heading">
      <div className={styles.header}>
        <h2 id="source-heading" className={styles.heading}>
          Source {citation.evidenceId}
        </h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close source">
          Close
        </button>
      </div>

      <dl className={styles.facts}>
        <dt>File</dt>
        <dd>{citation.fileName}</dd>
        <dt>Location</dt>
        <dd>{formatSourceLocation(citation.source)}</dd>
      </dl>

      <h3 className={styles.subheading}>Excerpt</h3>
      <blockquote className={styles.snippet}>{citation.snippet}</blockquote>

      <h3 className={styles.subheading}>Full source text</h3>
      {evidence.status === "loading" && (
        <p className={styles.placeholder} role="status">
          Loading source text…
        </p>
      )}
      {evidence.status === "error" && <ErrorBanner message={evidence.message} onRetry={onRetry} />}
      {evidence.status === "loaded" && (
        <>
          <p className={styles.kind}>{evidence.evidence.kind === "tableRow" ? "Table row" : "Text passage"}</p>
          <pre className={styles.fullText}>{evidence.evidence.text}</pre>
        </>
      )}
    </aside>
  );
}
