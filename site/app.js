import { answer, buildLibrary, toKnowledgeMarkdown } from "./search.js";

const LEARNED_KEY = "ocean-agent-learned";
const TOKEN_KEY = "ocean-agent-github-token";
const REPO = "moshujiqiao39/ocean-agent";

const modeEl = document.querySelector("#mode");
const docsEl = document.querySelector("#docs");
const logEl = document.querySelector("#log");
const emptyEl = document.querySelector("#empty");
const form = document.querySelector("#composer");
const input = document.querySelector("#question");
const sendBtn = document.querySelector("#send");
const devToggle = document.querySelector("#dev-toggle");
const developer = document.querySelector("#developer");
const learnForm = document.querySelector("#learn-form");
const learnTitle = document.querySelector("#learn-title");
const learnAsks = document.querySelector("#learn-asks");
const learnBody = document.querySelector("#learn-body");
const learnFile = document.querySelector("#learn-file");
const learnStatus = document.querySelector("#learn-status");
const tokenInput = document.querySelector("#github-token");
const syncButton = document.querySelector("#sync-learned");
const learnedList = document.querySelector("#learned");

let busy = false;
let rawOverride = "";
let published = [];
let learned = [];
let library = null;

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

function token() {
  return tokenInput.value.trim();
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
    name.textContent = item.remote ? `${item.title} · 已同步` : item.title;
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

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function publishFile(item) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/knowledge/${item.file}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `学习海洋知识：${item.title}`,
      content: utf8ToBase64(item.raw),
      branch: "main",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "GitHub 没有接受这份资料");
  item.remote = true;
  item.sha = data.content && data.content.sha;
}

async function removeRemote(item) {
  if (!item.remote || !item.sha || !token()) return;
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/knowledge/${item.file}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `撤回海洋知识：${item.title}`,
      sha: item.sha,
      branch: "main",
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "GitHub 上的副本没有删除");
  }
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
  const open = !developer.classList.contains("open");
  developer.classList.toggle("open", open);
  devToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) learnTitle.focus();
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

learnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = learnTitle.value.trim();
  const body = learnBody.value.trim();
  if (!title || !body) return;
  const file = `learned-${Date.now()}.md`;
  const raw = rawOverride || toKnowledgeMarkdown(title, learnAsks.value, body);
  const item = { file, title, raw, remote: false, sha: "" };
  learned.push(item);
  saveLearned();
  rebuild();
  learnForm.reset();
  rawOverride = "";
  learnStatus.textContent = "这台浏览器已经学会。";
  if (!token()) {
    learnStatus.textContent = "这台浏览器已经学会。要让其他电脑也学会，填入 GitHub 令牌后点「同步到其他电脑」。";
    return;
  }
  try {
    await publishFile(item);
    saveLearned();
    rebuild();
    learnStatus.textContent = "已经学会，并写入 GitHub。其他电脑大约一两分钟后可用。";
  } catch (error) {
    learnStatus.textContent = `这台浏览器已经学会。同步失败：${error.message}`;
  }
});

syncButton.addEventListener("click", async () => {
  if (!token()) {
    learnStatus.textContent = "先填入 GitHub 令牌。";
    return;
  }
  localStorage.setItem(TOKEN_KEY, token());
  const pending = learned.filter((item) => !item.remote);
  if (!pending.length) {
    learnStatus.textContent = "没有待同步的新知识。";
    return;
  }
  syncButton.disabled = true;
  const errors = [];
  for (const item of pending) {
    try {
      await publishFile(item);
    } catch (error) {
      errors.push(error.message);
    }
  }
  saveLearned();
  rebuild();
  syncButton.disabled = false;
  learnStatus.textContent = errors.length
    ? `有 ${errors.length} 条没有同步：${errors[0]}`
    : "已同步到 GitHub。其他电脑大约一两分钟后可用。";
});

tokenInput.addEventListener("change", () => {
  if (token()) localStorage.setItem(TOKEN_KEY, token());
  else localStorage.removeItem(TOKEN_KEY);
});

learnedList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-file]");
  if (!button) return;
  const item = learned.find((entry) => entry.file === button.dataset.file);
  if (!item) return;
  button.disabled = true;
  try {
    await removeRemote(item);
    learned = learned.filter((entry) => entry.file !== item.file);
    saveLearned();
    rebuild();
    learnStatus.textContent = item.remote ? "已从这台浏览器和 GitHub 撤回。" : "已从这台浏览器撤回。";
  } catch (error) {
    button.disabled = false;
    learnStatus.textContent = error.message;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

logEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-q]");
  if (button) ask(button.dataset.q);
});

tokenInput.value = localStorage.getItem(TOKEN_KEY) || "";
sendBtn.disabled = true;
loadPublished().catch(() => {
  modeEl.textContent = "资料没有载入";
});
