// Exclude private Linear requests and OAuth callbacks from error reporting.
// Dropping the event also drops automatically attached request bodies/headers.
export function containsLinearTelemetry(value: unknown): boolean {
  const visited = new WeakSet<object>();
  function inspect(item: unknown, depth: number): boolean {
    if (depth > 32) return true; // Drop uninspectable payloads rather than risk disclosure.
    if (typeof item === "string")
      return /(?:\/trpc\/[^?#\s]*\blinear\.|\/tracker-linear(?:[/?\s]|$)|\/tracker\/linear(?:[/?\s]|$)|https:\/\/(?:api\.)?linear\.app\/)/i.test(
        item,
      );
    if (!item || typeof item !== "object" || visited.has(item)) return false;
    visited.add(item);
    return Object.entries(item).some(
      ([key, child]) =>
        (key === "path" &&
          typeof child === "string" &&
          child.startsWith("linear.")) ||
        inspect(child, depth + 1),
    );
  }
  return inspect(value, 0);
}
