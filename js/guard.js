// FR-08: stop an outdated response from overwriting a newer search.
// Each begin() invalidates every earlier request and aborts it.

export function createRequestGuard() {
  let current = 0;
  let controller = null;

  return {
    begin() {
      current += 1;
      if (controller) controller.abort();
      controller = new AbortController();
      const id = current;
      return { id, signal: controller.signal };
    },
    isLatest(id) {
      return id === current;
    },
  };
}
