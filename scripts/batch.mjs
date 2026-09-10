/**
 * Group documents by parent, document type and update options, then update all of them.
 * @param {{doc: object, changes: object, options?: object}[]} entries Resolved documents paired with their per-document update payload, and any update options to pass through. Entries carrying different options land in separate operations.
 * @returns {Promise<void>}
 */
export async function batchUpdate(entries) {
  const groups = new Map();
  for (const { doc, changes, options } of entries) {
    if (!doc || !changes || !Object.keys(changes).length) continue;
    const key = `${doc.parent ? doc.parent.uuid : 'world'}:${doc.documentName}:${JSON.stringify(options ?? null)}`;
    if (!groups.has(key)) groups.set(key, { parent: doc.parent, documentName: doc.documentName, options, updates: new Map() });
    groups.get(key).updates.set(doc.id, { ...groups.get(key).updates.get(doc.id), _id: doc.id, ...changes });
  }
  const operations = [...groups.values()].map(({ parent, documentName, options, updates }) => ({ ...options, action: 'update', documentName, updates: [...updates.values()], parent }));
  if (operations.length) await foundry.documents.modifyBatch(operations);
}

/**
 * Group documents by parent and document type, then delete all of them in one `foundry.documents.modifyBatch()` round trip.
 * @param {object[]} docs Resolved documents to delete.
 * @returns {Promise<void>}
 */
export async function batchDelete(docs) {
  const groups = new Map();
  for (const doc of docs) {
    if (!doc) continue;
    const key = doc.parent ? `${doc.parent.uuid}:${doc.documentName}` : `world:${doc.documentName}`;
    if (!groups.has(key)) groups.set(key, { parent: doc.parent, documentName: doc.documentName, ids: new Set() });
    groups.get(key).ids.add(doc.id);
  }
  const operations = [...groups.values()].map(({ parent, documentName, ids }) => ({ action: 'delete', documentName, ids: [...ids], parent }));
  if (operations.length) await foundry.documents.modifyBatch(operations);
}

/**
 * Group new-document data by parent, then create all of them.
 * @param {{parent: object|null, documentName: string, data: object, keepId?: boolean}[]} entries A parent document (or null, for a world-level document) paired with the data to create on it. `keepId` honours an explicit `_id` in `data`.
 * @returns {Promise<void>}
 */
export async function batchCreate(entries) {
  const groups = new Map();
  for (const { parent, documentName, data, keepId } of entries) {
    if (!data) continue;
    const key = parent ? `${parent.uuid}:${documentName}` : `world:${documentName}`;
    if (!groups.has(key)) groups.set(key, { parent, documentName, data: [], keepId: false });
    groups.get(key).data.push(data);
    if (keepId) groups.get(key).keepId = true;
  }
  const operations = [...groups.values()].map(({ parent, documentName, data, keepId }) => ({ action: 'create', documentName, data, parent: parent ?? undefined, keepId }));
  if (operations.length) await foundry.documents.modifyBatch(operations);
}
