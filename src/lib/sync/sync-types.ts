import type { Diagram } from '@/lib/domain/diagram';

export type SerializedDiagram = Omit<Diagram, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
};

export interface SyncedDiagramState {
    revision: number;
    hash: string | null;
    deleted: boolean;
}

export interface SyncMetadata {
    id: 1;
    clientId: string;
    workspaceRevision: number | null;
    configRevision: number | null;
    defaultDiagramId: string;
    diagrams: Record<string, SyncedDiagramState>;
}

export interface ServerDiagramEntry {
    revision: number;
    updatedAt: string;
    hash: string;
    data: SerializedDiagram;
}

export interface ServerTombstone {
    revision: number;
    deletedAt: string;
}

export interface ServerWorkspace {
    schemaVersion: 1;
    workspaceRevision: number;
    updatedAt: string;
    config: {
        revision: number;
        defaultDiagramId: string;
    };
    diagrams: Record<string, ServerDiagramEntry>;
    tombstones: Record<string, ServerTombstone>;
}

export interface DiagramConflict {
    diagramId: string;
    localType: 'upsert' | 'delete';
    serverRevision: number | null;
    serverDiagram: SerializedDiagram | null;
    deletedOnServer: boolean;
}

export type SyncChange =
    | {
          type: 'upsert';
          diagramId: string;
          baseRevision: number | null;
          data: SerializedDiagram;
      }
    | {
          type: 'delete';
          diagramId: string;
          baseRevision: number | null;
      };

export interface SyncResponse {
    status: 'ok' | 'uninitialized' | 'initial-conflict' | 'recovered';
    workspace: ServerWorkspace | null;
    conflicts: DiagramConflict[];
    intervalMs: number;
    serverTime: string;
}
