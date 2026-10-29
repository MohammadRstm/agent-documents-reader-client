import type { ChatMessage, Citation } from "../../api/types";
import { AnswerMarkdown } from "../AnswerMarkdown/AnswerMarkdown";
import { CitationChip } from "../CitationChip/CitationChip";
import styles from "./MessageItem.module.css";

interface MessageItemProps {
  message: ChatMessage;
  onCitationClick: (citation: Citation) => void;
}

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.evidenceId)) {
      return false;
    }
    seen.add(citation.evidenceId);
    return true;
  });
}

export function MessageItem({ message, onCitationClick }: MessageItemProps) {
  if (message.role === "user") {
    return (
      <article className={`${styles.message} ${styles.user}`} aria-label="Your question">
        <p className={styles.userText}>{message.content}</p>
      </article>
    );
  }

  const sources = uniqueCitations(message.citations);

  return (
    <article className={`${styles.message} ${styles.assistant}`} aria-label="Assistant answer">
      <AnswerMarkdown content={message.content} citations={message.citations} onCitationClick={onCitationClick} />
      {message.incomplete && (
        <p className={styles.incomplete} role="note">
          This answer may be incomplete: the assistant reached its processing limit before finishing.
        </p>
      )}
      {sources.length > 0 && (
        <div className={styles.sources}>
          <span className={styles.sourcesLabel}>Sources:</span>
          {sources.map((citation) => (
            <CitationChip key={citation.evidenceId} citation={citation} onClick={onCitationClick} showDetails />
          ))}
        </div>
      )}
    </article>
  );
}
