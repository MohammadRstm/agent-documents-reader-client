# agent-documents-reader-client

React frontend for the AI document-analysis assistant. Users upload PDF and Excel
documents, ask questions about them in a chat interface, and inspect the sources
(PDF pages, Excel cell ranges) behind every answer.
The backend is the separate ASP.NET Core project `agent-documents-reader-server`.

## Stack

- Vite + React + TypeScript, plain CSS modules
- `react-markdown` + `remark-gfm` for answers (raw HTML is never rendered)
- Vitest + React Testing Library (jsdom) for tests
- oxlint for linting (shipped by the current `create-vite` React + TypeScript template)

## Prerequisites

- Node.js 24 and npm 11
- The backend running on `http://localhost:5080` (the Vite dev server proxies `/api` to it)

## Scripts

| Command | What it does |
|---|---|
| `npm ci` | Install the exact dependencies from `package-lock.json` |
| `npm run dev` | Start the dev server on `http://localhost:5173` |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Type-check with `tsc -b` |
| `npm test` | Run the tests once (`vitest run`) |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

CI (`.github/workflows/ci.yml`) runs install, lint, type-check, tests and build on every
pull request and on pushes to `develop` and `main`.

## Project layout

```
docs/api-contract.md   Shared API contract with the server (keep both copies identical)
src/api/               Fetch wrapper, typed API errors, SSE parser, contract types
src/hooks/             useSession, useDocuments, useChat, useEvidence
src/components/        UploadPanel, DocumentList, ChatPanel, MessageList, MessageItem,
                       AnswerMarkdown, CitationChip, SourcePanel, ErrorBanner
src/utils/             Small helpers (file extensions, file sizes, source locations)
```

## Behaviour notes

- The session ID is kept in `sessionStorage` and sent as `X-Session-Id`. If the server
  reports `session_not_found`, a new session is created and the user is told that the
  previous documents and chat are no longer available.
- The upload panel only offers `.pdf`, `.xlsx`, `.xlsm` and `.xls`. This is a convenience
  check; the server validates every file.
- Chat answers stream over server-sent events read from `fetch` (`POST /api/chat`).
  The streamed draft is shown as plain text with the latest progress message; the final
  `done` answer replaces it. Malformed or unknown events are skipped. A stream that ends
  without `done` or `error` shows a generic error. Answers can be cancelled.
- Answers are rendered with `react-markdown` + `remark-gfm` with raw HTML skipped and
  images shown only for absolute http(s) URLs (lazy, no referrer). `[E12]` markers become clickable source chips only when the backend
  sent a matching citation; clicking one opens the source panel (file, page or sheet and
  range, snippet, and the full text from `GET /api/evidence/{id}`).
- Error messages shown to users come from the contract's safe `message` field or from
  generic client messages. Raw server output is never displayed.
