import { answer, buildLibrary } from "./search.js";

const modeEl = document.querySelector("#mode");
const docsEl = document.querySelector("#docs");
const logEl = document.querySelector("#log");
const emptyEl = document.querySelector("#empty");
const form = document.querySelector("#composer");
const input = document.querySelector("#question");
const sendBtn = document.querySelector("#send");

let busy = false;
let library = null;

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

async function loadLibrary() {
  const manifest = await fetch("knowledge/manifest.json");
  if (!manifest.ok) throw new Error("manifest");
  const files = await manifest.json();
  const entries = [];
  for (const file of files) {
    const response = await fetch(`knowledge/${encodeURIComponent(file)}`);
    if (!response.ok) throw new Error(file);
    entries.push({ file, raw: await response.text() });
  }
  library = buildLibrary(entries);
  modeEl.textContent = `已掌握 ${library.docs.length} 篇 · 关机后仍可访问`;
  docsEl.replaceChildren();
  for (const doc of library.docs) {
    const li = document.createElement("li");
    li.textContent = doc.title;
    docsEl.appendChild(li);
  }
  sendBtn.disabled = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

logEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-q]");
  if (button) ask(button.dataset.q);
});

sendBtn.disabled = true;
loadLibrary().catch(() => {
  modeEl.textContent = "资料没有载入";
});
