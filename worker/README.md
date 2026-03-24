# Thumbnail Generator Worker

Cloudflare Worker — прокси между фронтендом и fal.ai API для генерации YouTube-превью.

## Установка

### 1. Установить Wrangler CLI

```bash
npm install -g wrangler
```

Авторизоваться в Cloudflare:

```bash
wrangler login
```

### 2. Настроить FAL_KEY

API-ключ fal.ai хранится как секрет Cloudflare Workers и **никогда** не попадает в код или конфиг.

```bash
cd worker
wrangler secret put FAL_KEY
```

Wrangler попросит ввести значение — вставьте ваш fal.ai API-ключ.

Для локальной разработки создайте файл `worker/.dev.vars`:

```
FAL_KEY=ваш_ключ_здесь
```

Этот файл уже в `.gitignore`.

### 3. Запустить локально

```bash
cd worker
wrangler dev
```

Worker будет доступен по адресу `http://localhost:8787`.

### 4. Задеплоить

```bash
cd worker
wrangler deploy
```

## API

### `POST /generate`

Генерирует YouTube-превью через fal.ai.

**Тело запроса (JSON):**

| Поле                | Тип    | Обязательно | Описание                                |
|---------------------|--------|-------------|-----------------------------------------|
| `image_url`         | string | нет         | Base64 или URL фото пользователя        |
| `video_title`       | string | да*         | Заголовок YouTube-видео                 |
| `video_description` | string | нет         | Описание видео                          |
| `custom_text`       | string | нет         | Текст для отображения на превью         |

\* Хотя бы одно из `video_title` или `custom_text` обязательно.

**Успешный ответ:**

```json
{ "image_url": "https://..." }
```

**Ответ с ошибкой:**

```json
{ "error": "описание ошибки", "details": "детали" }
```

## Пример curl-запроса

```bash
curl -X POST http://localhost:8787/generate \
  -H "Content-Type: application/json" \
  -d '{
    "video_title": "10 JavaScript Tips You Must Know",
    "video_description": "Advanced JavaScript tricks for web developers",
    "custom_text": "JS TIPS"
  }'
```

С фото пользователя:

```bash
curl -X POST http://localhost:8787/generate \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/photo.jpg",
    "video_title": "My New Video",
    "custom_text": "WATCH NOW"
  }'
```
