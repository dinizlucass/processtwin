import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const requirePackage = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../src/", import.meta.url));
const cache = new Map();
export function loadTs(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const result = { exports: {} };
  cache.set(file, result);
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolve = (name) => name.startsWith("@/") ? loadTs(name.slice(2) + ".ts") : requirePackage(name);
  new Function("require", "module", "exports", code)(resolve, result, result.exports);
  return result.exports;
}
