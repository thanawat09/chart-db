# Use a server-owned workspace for browser sync

Every browser that can reach the same ChartDB service, including a service deployed on a VPS, must share one workspace. The server therefore owns the canonical workspace data and exposes sync operations to browsers; sync cannot depend on browser-local storage or development-only Vite middleware.
