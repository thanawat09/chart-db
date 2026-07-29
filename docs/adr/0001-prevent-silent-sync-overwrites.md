# Prevent silent sync overwrites

Remote changes are imported automatically only when the receiving browser has no unsynced changes to the same diagram. Concurrent changes to the same diagram produce a conflict instead of using last-write-wins, preventing either browser from silently destroying the other browser's work.

On first connection, an uninitialized server accepts the first non-empty browser workspace, while an empty browser imports an existing server workspace automatically. If both sides already contain different data without a shared sync history, the browser requires an explicit choice of which side becomes canonical.

Revisions and conflicts are tracked per diagram. Changes to different diagrams merge automatically, so concurrent work does not lock or replace the entire workspace.

When a same-diagram conflict occurs, the user can preserve both versions by cloning the browser version, accept the server version, or explicitly replace the server version with the browser version. Preserving both is the recommended action.
