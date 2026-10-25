// Diagnostic helper only. Uses the documented App API; no game or OS internals.
// A successful AX condition still requires separate visual inspection before
// continuing gameplay. This helper never retries or falls back to coordinates.
// Call serially for each App. expectedPage must bind the isolated session both
// before and after input; menu-only snapshots without that proof stop safely.
export async function verifiedAXInput(app, { expectedPage, isTarget, changed }) {
  if (![expectedPage, isTarget, changed].every(f => typeof f === 'function')) {
    throw new TypeError('Page, target, and postcondition predicates are required');
  }
  let before;
  try {
    before = await app.getAXState({ emit: false, disableDiffing: true });
  } catch (error) {
    return { status: 'stopped', phase: 'read-before', error: String(error) };
  }
  if (!expectedPage(before)) return { status: 'stopped', phase: 'wrong-page', before };
  const nodes = before.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    return match && !match[2].includes('(disabled)')
      ? [{ id: Number(match[1]), text: match[2], line }]
      : [];
  }).filter(isTarget);
  if (nodes.length !== 1) {
    return { status: 'stopped', phase: 'target-count', count: nodes.length, before };
  }
  const target = nodes[0];
  try {
    // No file I/O, screenshot, second snapshot, or other UI operation between
    // selecting this fresh AX id and sending this one input.
    await app.click(target.id);
  } catch (error) {
    return { status: 'stopped', phase: 'input', error: String(error), target, before };
  }
  let after;
  try {
    after = await app.getAXState({ emit: false, disableDiffing: true });
  } catch (error) {
    return { status: 'stopped', phase: 'read-after', error: String(error), target, before };
  }
  if (!expectedPage(after)) {
    return { status: 'stopped', phase: 'wrong-page-after', target, before, after };
  }
  if (before === after || !changed(before, after)) {
    return { status: 'stopped', phase: 'postcondition', target, before, after };
  }
  return { status: 'awaiting-visual-check', phase: 'ax-condition-met', target, before, after };
}
