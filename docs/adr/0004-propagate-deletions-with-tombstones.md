# Propagate diagram deletions with tombstones

Deleting a diagram removes it from the shared workspace and every connected browser. The server retains a deletion marker so an offline browser cannot recreate a stale copy on reconnect, and file updates preserve one previous workspace backup for recovery from an accidental deletion or failed write.
