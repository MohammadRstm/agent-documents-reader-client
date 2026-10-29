import { DocumentList } from "./components/DocumentList/DocumentList";
import { ErrorBanner } from "./components/ErrorBanner/ErrorBanner";
import { UploadPanel } from "./components/UploadPanel/UploadPanel";
import { useDocuments } from "./hooks/useDocuments";
import { useSession } from "./hooks/useSession";
import styles from "./App.module.css";

function App() {
  const { session, notice, dismissNotice, retry, handleSessionNotFound } = useSession();
  const sessionId = session.status === "ready" ? session.sessionId : null;
  const documents = useDocuments(sessionId, handleSessionNotFound);

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

      <main className={styles.main}>
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

        <section className={styles.chatArea} aria-labelledby="chat-heading">
          <h2 id="chat-heading" className={styles.chatHeading}>
            Chat
          </h2>
          <p className={styles.chatPlaceholder}>Chat is not available yet.</p>
        </section>
      </main>
    </div>
  );
}

export default App;
