import { useEffect, useRef } from "react";
import type { ChatMessage, Citation } from "../../api/types";
import type { PendingAnswer } from "../../hooks/useChat";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import { MessageItem } from "../MessageItem/MessageItem";
import styles from "./MessageList.module.css";

interface MessageListProps {
  messages: ChatMessage[];
  pendingAnswer: PendingAnswer | null;
  isLoading: boolean;
  /** Safe message when the history could not be loaded. */
  error: string | null;
  onRetry: () => void;
  onCitationClick: (citation: Citation) => void;
}

export function MessageList({
  messages,
  pendingAnswer,
  isLoading,
  error,
  onRetry,
  onCitationClick,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the newest content in view while messages arrive and the answer streams.
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length, pendingAnswer?.draft, pendingAnswer?.status]);

  if (isLoading) {
    return (
      <p className={styles.placeholder} role="status">
        Loading conversation…
      </p>
    );
  }
  if (error) {
    return <ErrorBanner message={error} onRetry={onRetry} />;
  }
  if (messages.length === 0 && pendingAnswer === null) {
    return (
      <p className={styles.placeholder}>
        Ask a question about your uploaded documents. Answers link to the pages and cells they are based on.
      </p>
    );
  }

  return (
    <div ref={containerRef} className={styles.list} role="log" aria-label="Conversation">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} onCitationClick={onCitationClick} />
      ))}
      {pendingAnswer && (
        <article className={styles.pending} aria-label="Answer in progress" aria-busy="true">
          <p className={styles.status} role="status">
            {pendingAnswer.status ?? "Waiting for the answer…"}
          </p>
          {/* The draft is shown as plain text: its citation markers are not validated yet. */}
          {pendingAnswer.draft && <p className={styles.draft}>{pendingAnswer.draft}</p>}
        </article>
      )}
    </div>
  );
}
