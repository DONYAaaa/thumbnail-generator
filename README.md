# AI-генератор превью для YouTube

Виджет (HTML/CSS/JS) + Cloudflare Worker, который через fal.ai генерирует превью по YouTube-ссылке.

## Как работает

1. Виджет отправляет YouTube-ссылку → Worker получает название, канал, превью через oEmbed
2. Worker вызывает LLM (Gemini 2.5 Flash) для составления промпта
3. Worker вызывает модель генерации (FLUX / PuLID) → возвращает URL изображения + текст оверлея
4. Виджет накладывает текст и отдаёт на скачивание / копирование / шаринг

### Режимы генерации

| Режим | Описание |
|-------|----------|
| Без фото | Тематическое превью по данным видео |
| Insert me | Загрузить портрет — лицо вставляется в сцену (PuLID) |
| Style ref | Загрузить референс — превью в стиле референса (FLUX img2img) |

## Структура

```
widget/
  index.html              # виджет
  thumbnail-widget.css    # стили
worker/
  index.js                # /config /analyze /upload /generate
  wrangler.toml           # конфиг, статика из ../widget
  .dev.vars.example       # шаблон секретов
```

## Требования

- Node.js (LTS)
- Cloudflare аккаунт с Workers
- fal.ai API-ключ — [fal.ai/dashboard](https://fal.ai/dashboard)

## Запуск

```bash
make install   # установить wrangler
make setup     # создать .dev.vars + wrangler login
make dev       # http://127.0.0.1:8787
```

Перед `make dev` убедитесь, что в `worker/.dev.vars` прописан `FAL_KEY`.

## Деплой

```bash
make deploy
```

После деплоя добавьте `FAL_KEY` в Cloudflare Dashboard → Workers → Settings → Variables.

## Команды

| Команда | Действие |
|---------|----------|
| `make install` | `npm install -g wrangler` |
| `make setup` | создать `.dev.vars` + `wrangler login` |
| `make check` | проверить наличие wrangler в PATH |
| `make dev` | запустить локально |
| `make deploy` | задеплоить в Cloudflare |

## Встраивание на внешний сайт

Если виджет живёт на другом домене, чем Worker:

```html
<div class="thumbnail-widget-root" data-worker-url="https://your-worker.example.com">
```

И добавьте `WIDGET_PUBLIC_URL=https://your-worker.example.com` в переменные Worker.
