import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answer, buildLibrary, toKnowledgeMarkdown } from "./search.js";

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
const custom = toKnowledgeMarkdown("海月水母", "水母有没有大脑", "海月水母没有大脑，身体里是一张神经网，用来感受水流和光线。");
const learned = answer(buildLibrary([...entries, { file: "learned-test.md", raw: custom }]), "水母有没有大脑");
const learnedOk = !learned.refused && learned.sources.some((item) => item.title.includes("海月水母"));
if (!learnedOk) failures += 1;
console.log(`${learnedOk ? "OK  " : "FAIL"} 水母有没有大脑 -> ${learned.sources.map((item) => item.title).join("、") || "-"}`);
console.log(`${cases.length + 1 - failures}/${cases.length + 1} passed`);
process.exit(failures ? 1 : 0);
