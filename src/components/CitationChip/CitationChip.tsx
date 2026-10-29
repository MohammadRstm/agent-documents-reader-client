import type { Citation } from "../../api/types";
import { formatSourceLocation } from "../../utils/citations";
import styles from "./CitationChip.module.css";

interface CitationChipProps {
  citation: Citation;
  onClick: (citation: Citation) => void;
  /** Also show the file name and location next to the evidence ID. */
  showDetails?: boolean;
}

export function CitationChip({ citation, onClick, showDetails = false }: CitationChipProps) {
  const location = formatSourceLocation(citation.source);
  const description = `${citation.fileName}, ${location}`;

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => onClick(citation)}
      title={description}
      aria-label={`Open source ${citation.evidenceId}: ${description}`}
    >
      {citation.evidenceId}
      {showDetails && <span className={styles.details}>{description}</span>}
    </button>
  );
}
