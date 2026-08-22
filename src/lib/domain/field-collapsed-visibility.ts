import type { DBField } from './db-field';
import { TABLE_MINIMIZED_FIELDS } from './db-table';

export const getRelationshipFieldIds = (
    rels: { sourceFieldId?: string; targetFieldId?: string }[]
): Set<string> => {
    const s = new Set<string>();
    for (const r of rels) {
        if (r.sourceFieldId) s.add(r.sourceFieldId);
        if (r.targetFieldId) s.add(r.targetFieldId);
    }
    return s;
};

export const isShowWhenCollapsedUnset = (field: DBField): boolean =>
    field.showWhenCollapsed === undefined || field.showWhenCollapsed === null;

export const isFieldRelationshipEndpoint = (
    fieldId: string,
    relationshipFieldIds: Set<string>
): boolean => relationshipFieldIds.has(fieldId);

export const isVisibleWhenCollapsed = (
    field: DBField,
    relationshipFieldIds: Set<string>
): boolean =>
    field.primaryKey ||
    isFieldRelationshipEndpoint(field.id, relationshipFieldIds) ||
    field.showWhenCollapsed === true;

export const getCollapsedVisibleFields = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): DBField[] =>
    fields.filter((f) => isVisibleWhenCollapsed(f, relationshipFieldIds));

export const needsShowMore = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): boolean =>
    fields.some((f) => !isVisibleWhenCollapsed(f, relationshipFieldIds));

export const computeLegacyCollapsedVisibleIds = (
    fields: DBField[],
    relationshipFieldIds: Set<string>,
    limit: number = TABLE_MINIMIZED_FIELDS
): Set<string> => {
    const must: DBField[] = [];
    const rest: DBField[] = [];
    for (const f of fields) {
        if (f.primaryKey || relationshipFieldIds.has(f.id)) must.push(f);
        else rest.push(f);
    }
    const mustTake = must.slice(0, limit);
    const remaining = limit - mustTake.length;
    const restTake = remaining > 0 ? rest.slice(0, remaining) : [];
    const chosen = new Set([...mustTake, ...restTake].map((f) => f.id));
    return chosen;
};

export const seedShowWhenCollapsedFlags = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): Array<{ fieldId: string; showWhenCollapsed: boolean }> => {
    if (!fields.some(isShowWhenCollapsedUnset)) return [];
    const legacy = computeLegacyCollapsedVisibleIds(
        fields,
        relationshipFieldIds
    );
    return fields.filter(isShowWhenCollapsedUnset).map((f) => ({
        fieldId: f.id,
        showWhenCollapsed: legacy.has(f.id),
    }));
};
