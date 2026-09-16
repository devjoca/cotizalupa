const HOUR_MS = 60 * 60 * 1000;

type RateWindow = {
  startedAt: number;
  count: number;
};

export class AnalysisGuard {
  readonly hourlyLimit: number;
  readonly concurrencyLimit: number;
  private readonly windows = new Map<string, RateWindow>();
  private active = 0;

  constructor(options = { hourlyLimit: 10, concurrencyLimit: 2 }) {
    this.hourlyLimit = options.hourlyLimit;
    this.concurrencyLimit = options.concurrencyLimit;
  }

  takeRateLimit(key: string, now = Date.now()): boolean {
    for (const [entryKey, window] of this.windows) {
      if (now - window.startedAt >= HOUR_MS) this.windows.delete(entryKey);
    }

    const window = this.windows.get(key);
    if (!window) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (window.count >= this.hourlyLimit) return false;
    window.count += 1;
    return true;
  }

  tryAcquire(): (() => void) | null {
    if (this.active >= this.concurrencyLimit) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

export const analysisGuard = new AnalysisGuard();
