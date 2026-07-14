const ACCENTS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

export function slugify(name: string): string {
  const folded = name
    .toLowerCase()
    .split("")
    .map((ch) => ACCENTS[ch] ?? ch)
    .join("");
  return folded
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toUpperCase()
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

export function processCode(name: string): string {
  return `${slugify(name || "PROC")}-${Date.now().toString().slice(-5)}`;
}
