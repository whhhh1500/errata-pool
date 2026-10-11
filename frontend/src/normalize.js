// Browser port of the contract's deterministic item adapter (normalize_item), used for the
// "preview as validators see it" button. The contract remains the source of truth.
const LETTERS = "ABCDEFGHIJ";

function answerIndex(answer, n) {
  if (typeof answer === "boolean") return -1;
  if (Number.isInteger(answer)) return answer >= 0 && answer < n ? answer : -1;
  const s = String(answer ?? "").trim();
  if (/^\d+$/.test(s)) { const i = Number(s); return i < n ? i : -1; }
  if (s.length === 1 && LETTERS.slice(0, n).includes(s.toUpperCase())) return LETTERS.indexOf(s.toUpperCase());
  return -1;
}

function unwrap(d) {
  if (d && typeof d === "object" && !Array.isArray(d) && Array.isArray(d.rows) && d.rows.length) {
    const f = d.rows[0];
    return f && typeof f === "object" && "row" in f ? f.row : f;
  }
  if (Array.isArray(d) && d.length) return d[0];
  return d;
}

export function normalizeItem(body) {
  let data;
  try {
    const raw = JSON.parse(body);
    // datasets-server answers an out-of-range offset with 200 and no rows: no item
    if (raw && typeof raw === "object" && Array.isArray(raw.rows) && !raw.rows.length) return { text: "(no such item: the source has no row for this id; validators would void the report)", key: "", missing: true };
    data = unwrap(raw);
  } catch {
    const doc = new DOMParser().parseFromString(body, "text/html");
    doc.querySelectorAll("script,style,noscript,svg,template,nav,footer").forEach((n) => n.remove());
    return { text: (doc.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 4000), key: "" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { text: JSON.stringify(data).slice(0, 4000), key: "" };
  const q = data.question || data.prompt || data.input || "";
  let choices = data.choices || data.options || [];
  if (choices && !Array.isArray(choices) && typeof choices === "object") choices = choices.text || [];
  const skip = new Set(["question", "prompt", "input", "choices", "options", "answer", "answerKey", "label"]);
  const lines = [];
  for (const k of Object.keys(data).sort()) {
    const v = data[k];
    if (skip.has(k)) continue;
    if ((typeof v === "string" || typeof v === "number") && String(v).length <= 200) lines.push(`${k}: ${v}`);
  }
  lines.push(`Question: ${q}`);
  let key = "";
  if (Array.isArray(choices) && choices.length >= 2 && choices.length <= LETTERS.length) {
    choices.forEach((c, i) => lines.push(`${LETTERS[i]}) ${c}`));
    const answer = data.answer ?? data.answerKey ?? data.label;
    const idx = answerIndex(answer, choices.length);
    if (idx >= 0) { key = LETTERS[idx]; lines.push(`Published answer key: ${key}) ${choices[idx]}`); }
    else lines.push(`Published answer key: ${answer}`);
  } else lines.push(`Published answer: ${data.answer ?? ""}`);
  return { text: lines.join("\n").slice(0, 4000), key };
}
