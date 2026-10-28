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
import styles from "./App.module.css";

function App() {
  const { session, notice, dismissNotice, retry, handleSessionNotFound } = useSession();
  const sessionId = session.status === "ready" ? session.sessionId : null;
  const documents = useDocuments(sessionId, handleSessionNotFound);
  const chat = useChat(sessionId, handleSessionNotFound);

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
        <h1 className={styles.title}>Document Analysis Assistant</h1>
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
            onUpload={(files) => void documents.upload(files)}
            isUploading={documents.isUploading}
            disabled={sessionId === null}
            error={documents.uploadError}
            onDismissError={documents.dismissUploadError}
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
