import { deepMerge } from "@std/collections";

/** Merge all objects into one. */
export function mergeObjects<T extends Record<string, any>>(
  base: T,
  ...others: T[]
): T {
  return others.reduce((acc, obj) => deepMerge<T>(acc, obj), base);
}
