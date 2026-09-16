// Small data-only lexer; never interprets expressions.
export function parseList(value) {
  if (Array.isArray(value))
    return [
      ...new Set(
        value
          .filter((v) => v != null)
          .map(String)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  let s = String(value ?? "").trim();
  if (!s || /^(none|null|nan|\[\])$/i.test(s)) return [];
  if (!s.startsWith("["))
    return s
      .split(/[|;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  s = s.slice(1).replace(/\]\s*$/, "");
  const result = [];
  let token = "",
    quote = null;
  const push = () => {
    const v = token.trim();
    if (v && !/^(none|null|nan)$/i.test(v)) result.push(v);
    token = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && i + 1 < s.length) {
        const n = s[++i];
        token += { n: "\n", r: "\r", t: "\t" }[n] ?? n;
      } else if (c === quote && /^\s*(,|$)/.test(s.slice(i + 1))) quote = null;
      else token += c;
    } else if ((c === "'" || c === '"') && !token.trim()) quote = c;
    else if (c === ",") push();
    else token += c;
  }
  push();
  return [...new Set(result)];
}
