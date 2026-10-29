import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage, Citation } from "../../api/types";
import { MAX_QUESTION_LENGTH, type ChatNotice, type PendingAnswer } from "../../hooks/useChat";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import { MessageList } from "../MessageList/MessageList";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  messages: ChatMessage[];
  pendingAnswer: PendingAnswer | null;
  isHistoryLoading: boolean;
  historyError: string | null;
  onReloadHistory: () => void;
  isStreaming: boolean;
  notice: ChatNotice | null;
  onDismissNotice: () => void;
  /** Resolves to false when the question was not accepted. */
  onSend: (question: string) => Promise<boolean>;
  onCancel: () => void;
  onCitationClick: (citation: Citation) => void;
  /** True while no session is available. */
  disabled: boolean;
}

export function ChatPanel({
  messages,
  pendingAnswer,
  isHistoryLoading,
  historyError,
  onReloadHistory,
  isStreaming,
  notice,
  onDismissNotice,
  onSend,
  onCancel,
  onCitationClick,
  disabled,
}: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const canSend = !disabled && !isStreaming && !isHistoryLoading && question.trim().length > 0;

  async function submitQuestion() {
    if (!canSend) {
      return;
    }
    const submitted = question;
    setQuestion("");
    const accepted = await onSend(submitted);
    if (!accepted) {
      // Give the text back unless the user has already started typing something new.
      setQuestion((current) => (current === "" ? submitted : current));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitQuestion();
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="chat-heading">
      <h2 id="chat-heading" className={styles.heading}>
        Chat
      </h2>

      <MessageList
        messages={messages}
        pendingAnswer={pendingAnswer}
        isLoading={isHistoryLoading}
        error={historyError}
        onRetry={onReloadHistory}
        onCitationClick={onCitationClick}
      />

      {notice && <ErrorBanner variant={notice.variant} message={notice.message} onDismiss={onDismissNotice} />}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="chat-question" className={styles.visuallyHidden}>
          Your question
        </label>
        <textarea
          id="chat-question"
          className={styles.input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          placeholder="Ask a question about your documents…"
          disabled={disabled}
        />
        <div className={styles.actions}>
          {isStreaming && (
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.primaryButton} disabled={!canSend}>
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
