/** Recursively converts snake_case object keys to camelCase (arrays and nested objects included). */
export function toCamelCase<T = unknown>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => toCamelCase(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      result[camelKey] = toCamelCase(value);
    }
    return result as unknown as T;
  }
  return input;
}
