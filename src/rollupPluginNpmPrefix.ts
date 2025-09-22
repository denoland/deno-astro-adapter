import { type Plugin } from "rollup";

function prefixNpm(text: string, wordsSet: Set<string>) {
  // Create a regex pattern from the Set, escaping special characters
  return text.replace(/'([^']+)'/g, (match, word) => {
    if (wordsSet.has(word)) {
      return `'npm:${word}'`;
    }
    return match;
  });
}

export const npmPrefixPlugin = (): Plugin => {
  const importsSet = new Set<string>();

  return {
    name: "npm-prefix-resolver", // A unique name for your plugin

    renderChunk(code, chunk) {
      for (const mod of chunk.imports) {
        if (mod.endsWith(".mjs") || mod.endsWith("ts") || mod.endsWith("js")) {
          continue;
        }
        importsSet.add(mod);
      }
      const newCode = prefixNpm(code, importsSet);
      return { code: newCode };
    },
  };
};
