# web/src/api

The only module in the UI that talks to the Kinotta server (D10).

## Public interface

`index.ts` exports `fetchProject()` (`{ name }`), `fetchReels()` (`{ state, reels }`) and their types.

## Does not handle

Comments, versions and live events (`EventSource`). Later tickets add them here.

## Dependencies

The browser's `fetch`. The server's `/api` routes (`server/http`).
