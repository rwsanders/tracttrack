/** Small in-memory TTL cache with a size cap; also de-duplicates in-flight work. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  private pending = new Map<string, Promise<V>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency so the oldest-inserted entry is the least recently used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /** Returns the cached value or computes it once, even under concurrent calls. */
  async wrap(key: string, compute: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const work = compute()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }
}
