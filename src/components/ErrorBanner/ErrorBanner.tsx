import styles from "./ErrorBanner.module.css";

interface ErrorBannerProps {
  /** Must already be safe to show to the user. */
  message: string;
  /** "error" is announced immediately; "notice" is informational. */
  variant?: "error" | "notice";
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, variant = "error", onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      className={`${styles.banner} ${variant === "error" ? styles.error : styles.notice}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {onRetry && (
          <button type="button" className={styles.button} onClick={onRetry}>
            Try again
          </button>
        )}
        {onDismiss && (
          <button type="button" className={styles.button} onClick={onDismiss} aria-label="Dismiss message">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
