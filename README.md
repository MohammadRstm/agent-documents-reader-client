# agent-documents-reader-client

React frontend for the AI document-analysis assistant. Users upload PDF and Excel
documents and (in a later step) ask questions about them in a chat interface. The
backend is the separate ASP.NET Core project `agent-documents-reader-server`.

> Status: work in progress. Session handling, document upload and the document list
> are implemented. The chat is not available yet.

## Stack

- Vite + React + TypeScript, plain CSS modules
- `react-markdown` + `remark-gfm` (for answers, used in a later step)
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
src/hooks/             useSession, useDocuments
src/components/        UploadPanel, DocumentList, ErrorBanner
src/utils/             Small helpers (file extensions, file sizes)
```

## Behaviour notes

- The session ID is kept in `sessionStorage` and sent as `X-Session-Id`. If the server
  reports `session_not_found`, a new session is created and the user is told that the
  previous documents and chat are no longer available.
- The upload panel only offers `.pdf`, `.xlsx`, `.xlsm` and `.xls`. This is a convenience
  check; the server validates every file.
- Error messages shown to users come from the contract's safe `message` field or from
  generic client messages. Raw server output is never displayed.
