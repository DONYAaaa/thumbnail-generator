# AI YouTube Thumbnail Generator

A small full-stack demo: a **static embeddable widget** (HTML/CSS/JS) plus a **Cloudflare Worker** that proxies metadata and image generation to **[fal.ai](https://fal.ai)**. Built as a take-home style deliverable: one repo, minimal moving parts, suitable for **Webflow embed** or any page that can host the assets and call the Worker.

## What it does

- User pastes a **public YouTube URL**; the Worker resolves title, channel, thumbnail, and optional description.
- User may upload a **photo** (optional): either **“Insert me”** (face-preserving thumbnail) or **“Style ref”** (image-to-image style reference).
- User can enable **on-thumbnail text** and type a headline or leave it empty for **auto-generated** short text from context.
- The Worker calls fal.ai (LLM for prompt crafting + image models) and returns an image URL plus overlay hints; the widget can **download**, **copy**, or **share** the result.

## Repository layout

| Path | Role |
|------|------|
| `widget/index.html` | Widget markup and client script |
| `widget/thumbnail-widget.css` | Widget styles |
| `worker/index.js` | Worker: `/config`, `/analyze`, `/upload`, `/generate` |
| `worker/wrangler.toml` | Worker config; **static assets** served from `../widget` |
| `worker/.dev.vars.example` | Example secrets (copy to `.dev.vars`) |

## Prerequisites

- **Node.js** (for [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/))
- **Cloudflare** account with Workers enabled
- **fal.ai** API key (`FAL_KEY`)

Install Wrangler globally (or use `npx wrangler` and adjust the Makefile if you prefer).

```bash
npm install -g wrangler
wrangler login
```

## Configuration

1. Copy secrets template:

   ```bash
   cp worker/.dev.vars.example worker/.dev.vars
   ```

2. Edit `worker/.dev.vars`:

   - **`FAL_KEY`** — required for `/upload` and `/generate`.
   - **`WIDGET_PUBLIC_URL`** (optional) — public origin returned by `GET /config` as `workerUrl`. Use when the browser’s URL differs from the Worker’s public URL (custom domain, tunnel, CMS embed). If unset, `/config` uses the **incoming request origin** (fine when you open the app at the Worker URL).

## Local development (macOS)

From the repository root:

```bash
make dev
```

Or manually:

```bash
cd worker && wrangler dev
```

Open the URL Wrangler prints (commonly `http://127.0.0.1:8787`). The Worker runs first; the widget is served as static assets from the same origin so `GET /config` and API calls work without CORS friction.

**Opening `widget/index.html` directly (`file://`)** is supported in a limited way: the script falls back to fetching config from `http://127.0.0.1:8787` while `wrangler dev` is running, or you can set `data-worker-url` / `?worker=` to point at your Worker origin.

### Makefile targets

| Target | Description |
|--------|-------------|
| `make help` | Show available targets |
| `make check` | Ensure `wrangler` is on `PATH` |
| `make dev` | Run `wrangler dev` in `worker/` |
| `make deploy` | Deploy to Cloudflare |

## Deploy to Cloudflare

```bash
make deploy
```

Set **`FAL_KEY`** (and optionally **`WIDGET_PUBLIC_URL`**) in the Worker’s environment in the Cloudflare dashboard for production.

## Embedding (e.g. Webflow)

Host the widget HTML/CSS on a URL the browser can load, or serve it from the Worker as now. If the **page origin is not** the Worker (CMS, another domain), set on the root element:

```html
<div class="thumbnail-widget-root" data-worker-url="https://YOUR-WORKER-ORIGIN">
```

Ensure `GET /config` on that origin returns the correct `workerUrl` (via `WIDGET_PUBLIC_URL` if needed). Stylesheet link must resolve (`thumbnail-widget.css` on the same host or absolute URL).

## API surface (Worker)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/config` | JSON `{ workerUrl }` for the browser |
| `POST` | `/analyze` | `{ url }` → YouTube metadata |
| `POST` | `/upload` | `{ image_base64 }` → fal storage URL |
| `POST` | `/generate` | Generation payload → image URL + text hints |

---

## User interaction scenarios (widget)

These are typical flows QA or product can walk through:

1. **Minimal path — link only**  
   Paste a valid public YouTube URL. Wait for automatic validation. Leave photo empty. Toggle thumbnail text on or off; leave custom text empty for auto text. **Generate** → review image → **Download** or **Copy image** or **Share**.

2. **Creator in frame**  
   After the video is recognized, choose **Insert me**, upload a clear portrait/selfie, optionally edit the headline, then **Generate**. Regenerate with the same inputs or change text/photo.

3. **Style reference**  
   Switch to **Style ref**, upload a reference still (e.g. another thumbnail look). **Generate** so the new thumbnail follows that visual style while staying on-topic for the pasted video.

4. **Custom headline**  
   Enable thumbnail text and type a short title (e.g. “I tried this for 30 days”). Generate; confirm overlay matches expectations in the UI.

5. **Change video**  
   After success, use **change** on the video card (or clear/adjust the URL) and paste another link; the flow re-analyzes and can generate again.

6. **Error handling**  
   Invalid or private URL → expect a clear inline error. With `FAL_KEY` missing or fal errors → user-facing message; fix config and retry.

7. **Embed scenario**  
   Widget on a third-party page with `data-worker-url` pointing at production Worker; confirm `/config` returns the public API base and all POSTs hit that host.
