const MIN_SCORE = 0.34;

const TRIGGERS = [
  [["水是暖", "比较暖", "比别处暖", "暖和", "热水", "暖流", "黑潮"], "暖流 黑潮 海温 热量"],
  [["涨两次", "涨两回", "涨潮", "退潮", "潮水", "潮汐"], "潮汐 高潮 低潮 引潮力 半日潮"],
  [["变白", "突然白", "白化", "珊瑚"], "珊瑚 白化 虫黄藻"],
  [["鱼特别多", "鱼这么多", "鱼很多", "渔场"], "上升流 营养盐 渔场"],
  [["厄尔尼诺", "拉尼娜", "异常变暖", "赤道太平洋"], "厄尔尼诺 拉尼娜 赤道"],
  [["贝壳", "变酸", "酸化", "碳酸钙"], "海洋酸化 碳酸钙 贝壳"],
  [["鲸鱼", "海豚", "回声", "夜里找", "晚上怎么找"], "鲸鱼 回声定位 齿鲸 须鲸"],
  [["海底", "海面", "温跃", "晒热"], "海水温度 混合层 温跃层"],
  [["台风", "风暴潮", "登陆后"], "台风 风暴潮 热带气旋"],
];

export const REFUSAL = "知识库里没有足够依据回答这个问题。可以换一个和海洋有关的问法，或者先在 knowledge 目录里补充资料。";

function normalize(text) {
  return text.toLowerCase().replace(/[^0-9A-Za-z_\u4e00-\u9fff]+/g, "");
}

function ngrams(text, size) {
  const compact = normalize(text);
  if (compact.length < size) return compact ? [compact] : [];
  const pieces = [];
  for (let i = 0; i <= compact.length - size; i += 1) pieces.push(compact.slice(i, i + size));
  return pieces;
}

function expand(query) {
  return TRIGGERS.filter(([keys]) => keys.some((key) => query.includes(key))).map(([, terms]) => terms).join("");
}

function coverage(query, text, size) {
  const pieces = ngrams(query, size);
  if (!pieces.length) return 0;
  const bag = new Set(ngrams(text, size));
  return pieces.filter((piece) => bag.has(piece)).length / pieces.length;
}

function titleBonus(query, title) {
  const compactQuery = normalize(query);
  const compactTitle = normalize(title);
  return compactTitle.length >= 2 && compactQuery.includes(compactTitle) ? 0.35 : 0;
}

function relevance(query, chunk) {
  const body = `${chunk.docTitle}\n${chunk.heading}\n${chunk.text}`;
  let score = 0.45 * coverage(query, body, 2) + 0.55 * coverage(query, body, 4) + titleBonus(query, chunk.docTitle);
  const extra = expand(query);
  if (extra) score += 0.15 * (0.45 * coverage(extra, body, 2) + 0.55 * coverage(extra, body, 4));
  return score;
}

function parseDoc(file, raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let title = file.replace(/\.md$/, "");
  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim() || title;
      break;
    }
  }
  const chunks = [];
  for (const section of text.split(/^(?=## )/m)) {
    const body = section.trim();
    if (!body || body.startsWith("# ")) continue;
    const contentLines = body.split("\n");
    const heading = contentLines[0].startsWith("## ") ? (contentLines[0].slice(3).trim() || title) : title;
    chunks.push({ docTitle: title, file, heading, text: body });
  }
  if (!chunks.length) chunks.push({ docTitle: title, file, heading: title, text: text.trim() });
  return { title, chunks };
}

export function visibleText(chunk, limit = 420) {
  const kept = [];
  for (const line of chunk.text.split("\n")) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#") || stripped.startsWith("人们会这样问")) continue;
    kept.push(stripped);
  }
  const text = kept.join("\n").trim();
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;
}

export function toKnowledgeMarkdown(title, questions, body) {
  const heading = title.trim();
  const lines = [`# ${heading}`, "", `## ${heading}`, ""];
  const asks = questions.trim();
  if (asks) lines.push(`人们会这样问：${asks}`, "");
  lines.push(body.trim(), "");
  return lines.join("\n");
}

export function buildLibrary(entries) {
  const docs = [];
  const chunks = [];
  for (const entry of [...entries].sort((a, b) => a.file.localeCompare(b.file))) {
    const parsed = parseDoc(entry.file, entry.raw);
    docs.push({ title: parsed.title, file: entry.file });
    chunks.push(...parsed.chunks);
  }
  return { docs, chunks };
}

export function search(library, query) {
  const ranked = library.chunks
    .map((chunk) => ({ chunk, score: relevance(query, chunk) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  if (top < MIN_SCORE) return { hits: [], topScore: top };
  const hits = [];
  const seen = new Set();
  for (const hit of ranked) {
    if (hit.score < top * 0.78) break;
    if (seen.has(hit.chunk.file)) continue;
    seen.add(hit.chunk.file);
    hits.push(hit);
    if (hits.length === 2) break;
  }
  return { hits, topScore: top };
}

export function answer(library, message) {
  const found = search(library, message.trim());
  if (!found.hits.length) {
    return { answer: REFUSAL, sources: [], refused: true };
  }
  const parts = ["根据已掌握的海洋资料：", ...found.hits.map((hit) => visibleText(hit.chunk))];
  return {
    answer: parts.join("\n\n"),
    sources: found.hits.map((hit) => ({
      title: hit.chunk.docTitle,
      heading: hit.chunk.heading,
      file: hit.chunk.file,
    })),
    refused: false,
  };
}
