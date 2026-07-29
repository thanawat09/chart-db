# Poll a Node API for workspace synchronization

Browsers synchronize through a Node API backed by a JSON workspace file, polling at an environment-configured interval. This works in local and VPS deployments with predictable reconnect behavior, while avoiding the connection lifecycle and operational complexity of WebSockets.
