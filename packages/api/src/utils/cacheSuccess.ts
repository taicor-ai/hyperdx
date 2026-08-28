export function cacheSuccess<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;

  return () => {
    if (cached === undefined) {
      const attempt = load();
      const guarded = attempt.catch(error => {
        if (cached === guarded) cached = undefined;
        throw error;
      });
      cached = guarded;
    }
    return cached;
  };
}
