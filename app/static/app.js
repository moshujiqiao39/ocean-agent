const modeEl = document.querySelector("#mode");
const docsEl = document.querySelector("#docs");
const logEl = document.querySelector("#log");
const emptyEl = document.querySelector("#empty");
const form = document.querySelector("#composer");
const input = document.querySelector("#question");
const sendBtn = document.querySelector("#send");

let busy = false;

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
    note.textContent = "依据：" + sources.map((item) => `《${item.title}》${item.heading}`).join("；");
    item.appendChild(note);
  }
  logEl.appendChild(item);
  logEl.scrollTop = logEl.scrollHeight;
}

async function ask(message) {
  if (busy || !message.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  addMessage("user", message.trim());
  input.value = "";
  addMessage("bot", "正在查找资料…");
  const pending = logEl.lastElementChild;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    pending.querySelector(".bubble").textContent = data.answer;
    if (data.sources && data.sources.length) {
      const note = document.createElement("p");
      note.className = "sources";
      note.textContent = "依据：" + data.sources.map((item) => `《${item.title}》${item.heading}`).join("；");
      pending.appendChild(note);
    }
  } catch (error) {
    pending.querySelector(".bubble").textContent = "这次没有连上问答服务，请确认页面是从本机服务打开的。";
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
    logEl.scrollTop = logEl.scrollHeight;
  }
}

async function loadStatus() {
  const response = await fetch("/api/status");
  const data = await response.json();
  modeEl.textContent = data.mode === "llm"
    ? `已掌握 ${data.documents.length} 篇 · 语言模型组织回答`
    : `已掌握 ${data.documents.length} 篇 · 按资料直接作答`;
  docsEl.replaceChildren();
  for (const doc of data.documents) {
    const li = document.createElement("li");
    li.textContent = doc.title;
    docsEl.appendChild(li);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

logEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-q]");
  if (button) ask(button.dataset.q);
});

loadStatus().catch(() => {
  modeEl.textContent = "知识还没读到";
});
