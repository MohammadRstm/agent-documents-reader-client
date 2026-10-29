import { useCallback, useState } from "react";
import type { Citation } from "./api/types";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { DocumentList } from "./components/DocumentList/DocumentList";
import { ErrorBanner } from "./components/ErrorBanner/ErrorBanner";
import { SourcePanel } from "./components/SourcePanel/SourcePanel";
import { UploadPanel } from "./components/UploadPanel/UploadPanel";
import { useChat } from "./hooks/useChat";
import { useDocuments } from "./hooks/useDocuments";
import { useEvidence } from "./hooks/useEvidence";
import { useSession } from "./hooks/useSession";
import { getChatBlockedReason } from "./utils/chatGating";
import styles from "./App.module.css";

function App() {
  const { session, notice, dismissNotice, retry, handleSessionNotFound } = useSession();
  const sessionId = session.status === "ready" ? session.sessionId : null;
  const documents = useDocuments(sessionId, handleSessionNotFound);
  const chat = useChat(sessionId, handleSessionNotFound);
  const chatBlockedReason = getChatBlockedReason({
    processingCount: documents.processingCount,
    hasReadableDocuments: documents.hasReadableDocuments,
    isLoadingDocuments: documents.isLoading,
  });

  // The selected citation belongs to the session it was opened in; it is hidden
  // automatically when the session changes.
  const [selection, setSelection] = useState<{ sessionId: string; citation: Citation } | null>(null);
  const selectedCitation = selection !== null && selection.sessionId === sessionId ? selection.citation : null;
  const evidence = useEvidence(sessionId, selectedCitation?.evidenceId ?? null, handleSessionNotFound);

  const openCitation = useCallback(
    (citation: Citation) => {
      if (sessionId !== null) {
        setSelection({ sessionId, citation });
      }
    },
    [sessionId],
  );
  const closeCitation = useCallback(() => setSelection(null), []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.brandMark} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 3.5h8l4.5 4.5v12.5H6z" strokeLinejoin="round" />
            <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Document Analysis Assistant</h1>
          <p className={styles.tagline}>Answers from your PDF and Excel files, with the pages and cells they come from</p>
        </div>
        {session.status === "loading" && (
          <p className={styles.sessionStatus} role="status">
            Starting session…
          </p>
        )}
      </header>

      {(notice || session.status === "error") && (
        <div className={styles.banners}>
          {notice && <ErrorBanner variant="notice" message={notice} onDismiss={dismissNotice} />}
          {session.status === "error" && (
            <ErrorBanner message={`Could not start a session. ${session.message}`} onRetry={retry} />
          )}
        </div>
      )}

      <main className={`${styles.main} ${selectedCitation ? styles.withSource : ""}`}>
        <aside className={styles.sidebar}>
          <UploadPanel
            onUpload={documents.upload}
            disabled={sessionId === null}
            uploads={documents.uploads}
            onDismissUpload={documents.dismissUpload}
          />
          <DocumentList
            documents={documents.documents}
            isLoading={documents.isLoading}
            error={documents.loadError}
            onRetry={documents.reload}
          />
        </aside>

        <ChatPanel
          messages={chat.messages}
          pendingAnswer={chat.pendingAnswer}
          isHistoryLoading={chat.isHistoryLoading}
          historyError={chat.historyError}
          onReloadHistory={chat.reloadHistory}
          isStreaming={chat.isStreaming}
          notice={chat.notice}
          onDismissNotice={chat.dismissNotice}
          onSend={chat.send}
          onCancel={chat.cancel}
          onCitationClick={openCitation}
          disabled={sessionId === null}
          blockedReason={chatBlockedReason}
        />

        {selectedCitation && (
          <SourcePanel
            citation={selectedCitation}
            evidence={evidence.state}
            onRetry={evidence.retry}
            onClose={closeCitation}
          />
        )}
      </main>
    </div>
  );
}

export default App;
