// Limit document startup work while keeping completed previews mounted.
export function createPreviewQueue(onChange, { concurrency = 4, timeout = 30000 } = {}) {
  const waiting = [],
    running = new Set();
  let total = 0,
    loaded = 0,
    failed = 0,
    stopped = false,
    sealed = false,
    resolveReady;
  let ready;
  const resetReady = () => {
    ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
  };
  resetReady();
  const state = () => ({ total, loaded, failed, pending: total - loaded - failed });
  function report() {
    onChange(state());
    if (sealed && !state().pending) resolveReady();
  }
  function pump() {
    if (stopped) return;
    while (running.size < concurrency && waiting.length) {
      const job = waiting.shift();
      running.add(job);
      job.finish = (success) => {
        if (!running.delete(job)) return;
        clearTimeout(job.timer);
        job.cleanup?.(success);
        if (success) loaded++;
        else failed++;
        report();
        queueMicrotask(pump);
      };
      job.timer = setTimeout(() => job.finish(false), timeout);
      try {
        job.cleanup = job.start(job.finish);
      } catch {
        job.finish(false);
      }
    }
  }
  return {
    get ready() {
      return ready;
    },
    state,
    add(start) {
      if (!state().pending) resetReady();
      const job = { start };
      waiting.push(job);
      total++;
      if (sealed) report();
      queueMicrotask(pump);
      return {
        get pending() {
          return waiting.includes(job) || running.has(job);
        },
        cancel() {
          const index = waiting.indexOf(job);
          if (index >= 0) waiting.splice(index, 1);
          else if (running.delete(job)) {
            clearTimeout(job.timer);
            job.cleanup?.(undefined);
          } else return;
          total--;
          report();
          queueMicrotask(pump);
        },
        prioritize() {
          const index = waiting.indexOf(job);
          if (index > 0) waiting.unshift(...waiting.splice(index, 1));
        },
      };
    },
    seal() {
      sealed = true;
      report();
    },
    destroy() {
      stopped = true;
      waiting.length = 0;
      for (const job of running) {
        clearTimeout(job.timer);
        job.cleanup?.(false);
      }
      running.clear();
      resolveReady();
    },
  };
}
