import mergeWith from "lodash/mergeWith.js";

function mergeArray(base: any, other: any) {
  if (Array.isArray(base)) {
    return base.concat(other);
  }
}

/** Merge all objects into one. */
export function mergeObjects<T extends Record<string, any>>(
  base: T,
  ...others: T[]
): T {
  return others.reduce(
    (acc, obj) => mergeWith<T, T>(acc, obj, mergeArray),
    base,
  );
}
