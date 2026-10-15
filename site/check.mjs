import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answer } from "./search.js";
import { buildLibrary } from "./search.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const entries = readdirSync(root)
  .filter((name) => name.endsWith(".md"))
  .map((file) => ({ file, raw: readFileSync(join(root, file), "utf8") }));
const library = buildLibrary(entries);

const cases = [
  ["海里为什么有的地方水是暖的", "黑潮"],
  ["日本旁边的海水为啥比较暖", "黑潮"],
  ["海里有些地方怎么会比别处暖", "黑潮"],
  ["海水为什么一天要涨两次", "潮汐"],
  ["为啥一天会涨两回潮", "潮汐"],
  ["珊瑚怎么突然白了", "珊瑚白化"],
  ["鲸鱼晚上怎么找吃的", "鲸鱼"],
  ["海边怎么鱼这么多", "上升流"],
  ["贝壳是不是更难长了", "海洋酸化"],
  ["赤道太平洋海水异常变暖会怎样", "厄尔尼诺"],
  ["台风登陆后为什么会变弱", "台风"],
  ["海面为什么比海底暖", "海水温度"],
  ["今天午饭吃什么", null],
  ["帮我写一首诗", null],
];

let failures = 0;
for (const [question, expect] of cases) {
  const result = answer(library, question);
  const titles = result.sources.map((item) => item.title).join("、") || "-";
  const ok = expect === null ? result.refused && result.sources.length === 0 : !result.refused && result.sources.some((item) => item.title.includes(expect));
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${question} -> ${titles}`);
}
console.log(`${cases.length - failures}/${cases.length} passed`);
process.exit(failures ? 1 : 0);
