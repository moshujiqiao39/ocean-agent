# 海洋智能体

公开网页：https://moshujiqiao39.github.io/ocean-agent/

其他电脑打开这个地址就能提问。页面放在 GitHub 上，你的电脑关机后仍然可以访问。更新 `knowledge/` 里的资料并推送后，网页会在一两分钟内换成新内容。

## 运行

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

也可以直接运行 `.\run.ps1`。打开 http://127.0.0.1:8765 。

不配置密钥时，智能体按资料原文作答。若要让语言模型组织口语，复制 `.env.example` 为 `.env`，填入兼容 OpenAI 接口的 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`。`.env` 不会被提交。

## 更新知识并同步到其他电脑

1. 在 `knowledge/` 里新增或修改 Markdown。
2. 提交并推送到 GitHub。
3. 其他电脑执行 `git pull`。正在运行的服务会在下一次提问时自动重新读取文件。

检查口语问题是否还能对上资料：

```powershell
.\.venv\Scripts\python -m app.check
```
