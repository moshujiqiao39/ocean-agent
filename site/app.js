import { answer, buildLibrary, toKnowledgeMarkdown } from "./search.js?v=3";

const LEARNED_KEY = "ocean-agent-learned";
const UNLOCK_KEY = "ocean-agent-dev-open";
const PASS_HASH = "384fde3636e6e01e0194d2976d8f26410af3e846e573379cb1a09e2f0752d8cc";

const modeEl = document.querySelector("#mode");
const docsEl = document.querySelector("#docs");
const logEl = document.querySelector("#log");
const emptyEl = document.querySelector("#empty");
const form = document.querySelector("#composer");
const input = document.querySelector("#question");
const sendBtn = document.querySelector("#send");
const devToggle = document.querySelector("#dev-toggle");
const developer = document.querySelector("#developer");
const gateForm = document.querySelector("#gate-form");
const devPass = document.querySelector("#dev-pass");
const gateStatus = document.querySelector("#gate-status");
const editor = document.querySelector("#dev-editor");
const learnForm = document.querySelector("#learn-form");
const learnTitle = document.querySelector("#learn-title");
const learnAsks = document.querySelector("#learn-asks");
const learnBody = document.querySelector("#learn-body");
const learnFile = document.querySelector("#learn-file");
const learnStatus = document.querySelector("#learn-status");
const learnedList = document.querySelector("#learned");

let busy = false;
let rawOverride = "";
let published = [];
let learned = [];
let library = null;
let unlocked = sessionStorage.getItem(UNLOCK_KEY) === "1";

function loadLearned() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLearned() {
  localStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
}

async function matchesPass(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex === PASS_HASH;
}

function showEditor(open) {
  gateForm.hidden = open;
  editor.hidden = !open;
  if (open) learnTitle.focus();
  else devPass.focus();
}

function rebuild() {
  const publishedFiles = new Set(published.map((entry) => entry.file));
  learned = learned.filter((item) => !publishedFiles.has(item.file));
  saveLearned();
  library = buildLibrary([...published, ...learned.map((item) => ({ file: item.file, raw: item.raw }))]);
  modeEl.textContent = `已掌握 ${library.docs.length} 篇 · 关机后仍可访问`;
  docsEl.replaceChildren();
  const learnedFiles = new Set(learned.map((item) => item.file));
  for (const doc of library.docs) {
    const li = document.createElement("li");
    li.textContent = learnedFiles.has(doc.file) ? `${doc.title} · 新学` : doc.title;
    docsEl.appendChild(li);
  }
  learnedList.replaceChildren();
  if (!learned.length) {
    const li = document.createElement("li");
    li.textContent = "还没有从这里加入的知识";
    learnedList.appendChild(li);
    return;
  }
  for (const item of learned) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item.title;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.file = item.file;
    remove.textContent = "删除";
    li.append(name, remove);
    learnedList.appendChild(li);
  }
}

function addMessage(role, text, sources) {
  emptyEl.hidden = true;
  const item = document.createElement("article");
  item.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  item.appendChild(bubble);
  if (sources && sources.length) {
    const note = document.createElement("p");
    note.className = "sources";
    note.textContent = "依据：" + sources.map((source) => `《${source.title}》${source.heading}`).join("；");
    item.appendChild(note);
  }
  logEl.appendChild(item);
  logEl.scrollTop = logEl.scrollHeight;
}

function ask(message) {
  if (busy || !library || !message.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  addMessage("user", message.trim());
  input.value = "";
  const result = answer(library, message);
  addMessage("bot", result.answer, result.sources);
  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

async function loadPublished() {
  const manifest = await fetch("knowledge/manifest.json");
  if (!manifest.ok) throw new Error("manifest");
  const files = await manifest.json();
  const entries = [];
  for (const file of files) {
    const response = await fetch(`knowledge/${encodeURIComponent(file)}`);
    if (!response.ok) throw new Error(file);
    entries.push({ file, raw: await response.text() });
  }
  published = entries;
  learned = loadLearned();
  rebuild();
  sendBtn.disabled = false;
}

devToggle.addEventListener("click", () => {
  const open = developer.hidden;
  developer.hidden = !open;
  developer.classList.toggle("open", open);
  devToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) showEditor(unlocked);
});

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = await matchesPass(devPass.value.trim());
  if (!ok) {
    gateStatus.textContent = "口令不对。";
    devPass.focus();
    return;
  }
  unlocked = true;
  sessionStorage.setItem(UNLOCK_KEY, "1");
  gateStatus.textContent = "";
  devPass.value = "";
  showEditor(true);
});

learnBody.addEventListener("input", () => {
  rawOverride = "";
});

learnFile.addEventListener("change", async () => {
  const file = learnFile.files && learnFile.files[0];
  if (!file) return;
  const text = await file.text();
  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch && /^##\s+/m.test(text)) {
    learnTitle.value = titleMatch[1].trim();
    learnBody.value = text.trim();
    rawOverride = text.replace(/\r\n/g, "\n");
    learnStatus.textContent = "已读入文件，提交后按这份原文学习。";
    return;
  }
  rawOverride = "";
  learnBody.value = text.trim();
  if (!learnTitle.value.trim()) learnTitle.value = file.name.replace(/\.(md|txt|markdown)$/i, "");
  learnStatus.textContent = "已读入文件，补上标题后即可学习。";
});

learnForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!unlocked) return;
  const title = learnTitle.value.trim();
  const body = learnBody.value.trim();
  if (!title || !body) return;
  const file = `learned-${Date.now()}.md`;
  const raw = rawOverride || toKnowledgeMarkdown(title, learnAsks.value, body);
  learned.push({ file, title, raw });
  saveLearned();
  rebuild();
  learnForm.reset();
  rawOverride = "";
  learnStatus.textContent = "这台浏览器已经学会。";
});

learnedList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-file]");
  if (!button) return;
  learned = learned.filter((entry) => entry.file !== button.dataset.file);
  saveLearned();
  rebuild();
  learnStatus.textContent = "已从这台浏览器撤回。";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

logEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-q]");
  if (button) ask(button.dataset.q);
});

localStorage.removeItem("ocean-agent-github-token");
showEditor(unlocked);
sendBtn.disabled = true;
loadPublished().catch(() => {
  modeEl.textContent = "资料没有载入";
});
