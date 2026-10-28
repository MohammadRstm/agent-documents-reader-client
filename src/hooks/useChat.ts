import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatHistory,
  getUserFacingErrorMessage,
  isAbortError,
  isApiError,
  streamChat,
} from "../api/client";
import type { ChatMessage, ChatStreamEvent, Citation } from "../api/types";

/** Contract limit for `POST /api/chat` questions (after trimming). */
export const MAX_QUESTION_LENGTH = 4000;

export const STREAM_INTERRUPTED_MESSAGE = "The answer was interrupted before it finished. Please try again.";
export const ANSWER_CANCELLED_MESSAGE = "You cancelled the answer.";

/** The answer currently being streamed. */
export interface PendingAnswer {
  /** Unvalidated streamed text; replaced by the final answer on `done`. */
  draft: string;
  /** Latest progress message, e.g. "Searching documents…". */
  status: string | null;
}

export interface ChatNotice {
  message: string;
  variant: "error" | "notice";
}

export interface UseChatResult {
  messages: ChatMessage[];
  isHistoryLoading: boolean;
  historyError: string | null;
  reloadHistory: () => void;
  pendingAnswer: PendingAnswer | null;
  isStreaming: boolean;
  notice: ChatNotice | null;
  dismissNotice: () => void;
  /**
   * Sends a question. Resolves to false when the server did not accept it (for
   * example validation, rate limit or a question already in progress), so the
   * caller can give the text back to the user.
   */
  send: (question: string) => Promise<boolean>;
  cancel: () => void;
}

export function useChat(
  sessionId: string | null,
  onSessionNotFound: (sessionId: string) => void,
): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(sessionId !== null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const localMessageCountRef = useRef(0);

  // Kept in a ref so a new callback identity does not trigger a reload.
  const onSessionNotFoundRef = useRef(onSessionNotFound);
  useEffect(() => {
    onSessionNotFoundRef.current = onSessionNotFound;
  }, [onSessionNotFound]);

  // Reset state while rendering when the session changes or a reload is requested.
  const [loadedFor, setLoadedFor] = useState({ sessionId, reloadCount });
  if (loadedFor.sessionId !== sessionId || loadedFor.reloadCount !== reloadCount) {
    setLoadedFor({ sessionId, reloadCount });
    setIsHistoryLoading(sessionId !== null);
    setHistoryError(null);
    if (loadedFor.sessionId !== sessionId) {
      // The conversation of a different session must never be shown.
      setMessages([]);
      setPendingAnswer(null);
      setIsStreaming(false);
      setNotice(null);
    }
  }

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    const controller = new AbortController();
    getChatHistory(sessionId, controller.signal)
      .then((response) => {
        setMessages(response.messages);
        setIsHistoryLoading(false);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        setIsHistoryLoading(false);
        if (isApiError(error) && error.code === "session_not_found") {
          onSessionNotFoundRef.current(sessionId);
          return;
        }
        setHistoryError(getUserFacingErrorMessage(error));
      });
    return () => controller.abort();
  }, [sessionId, reloadCount]);

  // Stop a running answer when the session changes or the component unmounts.
  useEffect(
    () => () => {
      streamControllerRef.current?.abort();
      streamControllerRef.current = null;
    },
    [sessionId],
  );

  const reloadHistory = useCallback(() => setReloadCount((count) => count + 1), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const cancel = useCallback(() => {
    const controller = streamControllerRef.current;
    if (controller === null) {
      return;
    }
    streamControllerRef.current = null;
    controller.abort();
    setPendingAnswer(null);
    setIsStreaming(false);
    setNotice({ variant: "notice", message: ANSWER_CANCELLED_MESSAGE });
  }, []);

  const send = useCallback(
    async (rawQuestion: string): Promise<boolean> => {
      const question = rawQuestion.trim();
      if (sessionId === null || streamControllerRef.current !== null) {
        return false;
      }
      if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
        setNotice({
          variant: "error",
          message: `Questions must be between 1 and ${MAX_QUESTION_LENGTH} characters.`,
        });
        return false;
      }

      const controller = new AbortController();
      streamControllerRef.current = controller;
      localMessageCountRef.current += 1;
      const userMessage: ChatMessage = {
        id: `local-question-${localMessageCountRef.current}`,
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
        citations: [],
        incomplete: false,
      };
      setMessages((current) => [...current, userMessage]);
      setPendingAnswer({ draft: "", status: null });
      setIsStreaming(true);
      setNotice(null);

      let citations: Citation[] = [];
      let isFinished = false;

      const handleEvent = (event: ChatStreamEvent) => {
        // Ignore anything after the final event or after cancellation.
        if (isFinished || streamControllerRef.current !== controller) {
          return;
        }
        switch (event.event) {
          case "status":
            setPendingAnswer((pending) => pending && { ...pending, status: event.data.message });
            break;
          case "delta":
            setPendingAnswer((pending) => pending && { ...pending, draft: pending.draft + event.data.text });
            break;
          case "citations":
            citations = event.data.citations;
            break;
          case "done": {
            isFinished = true;
            const answer: ChatMessage = {
              id: event.data.messageId,
              role: "assistant",
              content: event.data.answer,
              createdAt: new Date().toISOString(),
              citations,
              incomplete: event.data.incomplete,
            };
            setMessages((current) => [...current, answer]);
            setPendingAnswer(null);
            break;
          }
          case "error":
            isFinished = true;
            setPendingAnswer(null);
            if (event.data.code === "session_not_found") {
              onSessionNotFoundRef.current(sessionId);
              break;
            }
            setNotice({
              variant: "error",
              message: event.data.message.trim() || "The answer could not be completed. Please try again.",
            });
            break;
        }
      };

      try {
        await streamChat(sessionId, question, handleEvent, controller.signal);
        if (!isFinished && !controller.signal.aborted) {
          // The stream closed without `done` or `error`.
          setPendingAnswer(null);
          setNotice({ variant: "error", message: STREAM_INTERRUPTED_MESSAGE });
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          // Cancelled by the user or by a session change; state was already updated.
          return true;
        }
        setPendingAnswer(null);
        if (isApiError(error)) {
          // Rejected before streaming started: the question was not accepted.
          setMessages((current) => current.filter((message) => message.id !== userMessage.id));
          if (error.code === "session_not_found") {
            onSessionNotFoundRef.current(sessionId);
          } else {
            setNotice({ variant: "error", message: error.message });
          }
          return false;
        }
        // The connection failed while the answer was streaming.
        setNotice({ variant: "error", message: STREAM_INTERRUPTED_MESSAGE });
        return true;
      } finally {
        if (streamControllerRef.current === controller) {
          streamControllerRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [sessionId],
  );

  return {
    messages,
    isHistoryLoading,
    historyError,
    reloadHistory,
    pendingAnswer,
    isStreaming,
    notice,
    dismissNotice,
    send,
    cancel,
  };
}
