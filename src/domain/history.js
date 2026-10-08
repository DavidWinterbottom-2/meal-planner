// Choosing what undo should reverse, from the append-only history.
//
// Each history row is { id, kind, undoes_id }. An "undo" row records which
// earlier row it reversed (undoes_id). Undo targets the newest change that is
// not itself an undo and has not already been undone — so repeated undos step
// back through earlier changes, and an undo is never itself undone.

export function pickUndoTarget(rows) {
  const undone = new Set(
    rows.filter((r) => r.kind === "undo").map((r) => r.undoes_id),
  );
  const candidates = rows
    .filter((r) => r.kind !== "undo" && !undone.has(r.id))
    .sort((a, b) => b.id - a.id);
  return candidates[0] ?? null;
}
