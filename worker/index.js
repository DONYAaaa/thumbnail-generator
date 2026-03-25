const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\/)([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/v\/([\w-]{11})/,
];

const FAL_QUEUE = 'https://queue.fal.run';
const FAL_SYNC = 'https://fal.run';
const POLL_INTERVAL = 2000;
const TIMEOUT = 120_000;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const { pathname } = new URL(request.url);
    if (pathname === '/config' && request.method === 'GET') return handleConfig(request, env);
    if (pathname === '/analyze' && request.method === 'POST') return handleAnalyze(request);
    if (pathname === '/generate' && request.method === 'POST') return handleGenerate(request, env);
    if (pathname === '/upload' && request.method === 'POST') return handleUpload(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: 'Not found' }, 404);
  },
};

function handleConfig(request, env) {
  const origin = new URL(request.url).origin;
  const fromEnv = env.WIDGET_PUBLIC_URL && String(env.WIDGET_PUBLIC_URL).trim();
  const workerUrl = (fromEnv || origin).replace(/\/$/, '');
  return json({ workerUrl });
}

function extractVideoId(url) {
  if (!url) return null;
  for (const p of YOUTUBE_PATTERNS) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function htmlDecode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function handleAnalyze(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const videoId = extractVideoId(body.url);
  if (!videoId) return json({ error: 'Invalid YouTube URL' }, 400);

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    'https://www.youtube.com/watch?v=' + videoId
  )}&format=json`;

  let title = '', author = '', thumb = '';
  try {
    const r = await fetch(oembedUrl);
    if (!r.ok) return json({ error: 'Video not found or private' }, 404);
    const d = await r.json();
    title = d.title || '';
    author = d.author_name || '';
    thumb = (d.thumbnail_url || '').replace(/\/hqdefault\.jpg/, '/maxresdefault.jpg');
  } catch {
    return json({ error: 'Could not fetch video data' }, 502);
  }

  let description = '';
  try {
    const r = await fetch('https://www.youtube.com/watch?v=' + videoId, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en',
      },
    });
    if (r.ok) {
      const html = await r.text();
      const m =
        html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ||
        html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
      if (m) description = htmlDecode(m[1]);
    }
  } catch {}

  return json({ id: videoId, title, author, description, thumbnail_url: thumb });
}

async function handleUpload(request, env) {
  if (!env.FAL_KEY) return json({ error: 'FAL_KEY not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { image_base64 } = body;
  if (!image_base64 || !image_base64.startsWith('data:')) {
    return json({ error: 'image_base64 is required (data URI)' }, 400);
  }

  try {
    const commaIdx = image_base64.indexOf(',');
    const header = image_base64.slice(0, commaIdx);
    const contentType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    const b64 = image_base64.slice(commaIdx + 1);
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: {
        Authorization: `Key ${env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content_type: contentType,
        file_name: 'thumbnail.jpg',
      }),
    });

    if (!initRes.ok) {
      const errText = await initRes.text();
      console.error('[upload] initiate failed:', initRes.status, errText);
      return json({ error: 'Upload initiation failed' }, 502);
    }

    const { upload_url, file_url } = await initRes.json();

    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: binary,
    });

    if (!putRes.ok) {
      console.error('[upload] PUT failed:', putRes.status);
      return json({ error: 'File upload failed' }, 502);
    }

    return json({ url: file_url });
  } catch (err) {
    console.error('[upload] Error:', err);
    return json({ error: 'Upload failed', details: err.message }, 500);
  }
}

async function handleGenerate(request, env) {
  if (!env.FAL_KEY) return json({ error: 'FAL_KEY not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const {
    mode = 'insert_me',
    image_url,
    video_title,
    video_description,
    video_thumbnail_url,
    custom_text,
    text_enabled = true,
  } = body;

  if (!video_title) return json({ error: 'video_title is required' }, 400);

  try {
    const llm = await craftPrompt(env, {
      mode,
      video_title,
      video_description,
      custom_text,
      hasImage: !!image_url,
      styleImageUrl: (mode === 'style_ref') ? image_url : null,
      textEnabled: text_enabled,
    });
    console.log('[gen] LLM:', JSON.stringify(llm));

    let result;

    if (image_url && mode === 'insert_me') {
      result = await falQueue(env, 'fal-ai/pulid', {
        prompt: llm.image_prompt,
        reference_images: [{ image_url: image_url }],
        image_size: "landscape_16_9",
        num_images: 1,
        num_inference_steps: 4,
        guidance_scale: 1.2,
        id_scale: 1.0,
      });
    } else if (image_url && mode === 'style_ref') {
      result = await falQueue(env, 'fal-ai/flux/dev/image-to-image', {
        prompt: llm.image_prompt,
        image_url,
        image_size: "landscape_16_9",
        strength: 0.85,
        num_inference_steps: 28,
        guidance_scale: 4.5,
        num_images: 1,
      });
    } else {
      result = await falQueue(env, 'fal-ai/flux/dev', {
        prompt: llm.image_prompt,
        image_size: "landscape_16_9",
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
      });
    }

    if (!result.images?.length) return json({ error: 'No images generated' }, 502);

    let overlayText = null;
    if (text_enabled) {
      overlayText = custom_text
        || llm.overlay_text
        || video_title.split(/\s+/).slice(0, 4).join(' ').toUpperCase();
    }

    return json({
      image_url: result.images[0].url,
      overlay_text: overlayText,
      text_style: overlayText ? {
        position: llm.text_position || 'bottom',
        color: llm.text_color || '#FFFFFF',
        stroke_color: llm.text_stroke_color || '#000000',
      } : null,
    });
  } catch (err) {
    console.error('[gen] Error:', err);
    return json({ error: 'Generation failed', details: err.message }, 500);
  }
}

  const LLM_SYSTEM = `You are an expert YouTube thumbnail designer and AI image-prompt engineer.
  Given video context you must produce:
  1. A detailed image-generation prompt for a stunning YouTube thumbnail.
  2. Short overlay text (or decide that no text is better).

  RULES
  - Image prompt: describe scene, lighting (dramatic), colours (vibrant, high-contrast), composition, mood.
    Do NOT mention any text or typography in the image prompt — text is added separately.
  - COMPOSITION: All key subjects MUST be placed in the center of the frame. Keep a safe margin from all edges — the outer 15% of the image may be cropped. Never place important elements near the edges.
  - Overlay text: 2-5 words max, punchy, attention-grabbing. If the user supplied custom_text, use it exactly.
    If text_required is true, you MUST always return overlay_text as a non-empty string — NEVER null.
    If text_required is false, return null.
  - If mode is "insert_me": THIS IS CRITICAL — the prompt MUST begin with a detailed description of a single person as the dominant subject.
    The person MUST occupy at least 40-60% of the frame. Describe: close-up or medium shot, facing the camera, clearly visible face with expressive emotion (shock, excitement, confidence, etc.), specific pose and hand gestures, placement in the frame (centered or rule-of-thirds).
    The face is the most important element — never obscure it. Background and environment come AFTER the person description.
  - If mode is "style_ref": describe a fresh scene matching the video topic; the reference image provides style/mood.
  - Aspect ratio 16:9, 1280x720.

Reply with ONLY valid JSON, no markdown fences, no extra text:
{"image_prompt":"...","overlay_text":"TEXT or null","text_position":"top|center|bottom","text_color":"#FFFFFF","text_stroke_color":"#000000"}`;

async function craftPrompt(env, { mode, video_title, video_description, custom_text, hasImage, styleImageUrl, textEnabled }) {
  const userLines = [
    `Video title: "${video_title}"`,
    `Description: "${video_description || '(not available)'}"`,
    `Mode: ${mode}`,
    `Custom text: ${custom_text || '(none — auto-generate)'}`,
    `Has reference image: ${hasImage ? 'yes' : 'no'}`,
    `text_required: ${textEnabled ? 'true' : 'false'}`,
  ];
  if (styleImageUrl) {
    userLines.push('A style reference image is attached. Analyze its visual style (art style, colour palette, rendering technique, mood) and use that in your prompt.');
  }
  const user = userLines.join('\n');

  const llmBody = {
    model: 'google/gemini-2.5-flash',
    system_prompt: LLM_SYSTEM,
    prompt: user,
    temperature: 0.7,
    max_tokens: 400,
  };
  if (styleImageUrl) {
    llmBody.image_url = styleImageUrl;
  }

  try {
    const r = await fetch(`${FAL_SYNC}/fal-ai/any-llm`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmBody),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const d = await r.json();
    const m = (d.output || '').match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (mode === 'insert_me' && hasImage) {
        const lower = (parsed.image_prompt || '').toLowerCase();
        const hasPersonRef = /\b(person|man|woman|face|portrait|looking at camera|facing|close-up|selfie)\b/.test(lower);
        if (!hasPersonRef) {
          parsed.image_prompt = 'Close-up of a person facing the camera with an expressive face, occupying 50% of the frame, ' + parsed.image_prompt;
        }
      }
      return parsed;
    }
  } catch (e) {
    console.warn('[gen] LLM fallback:', e.message);
  }

  return {
    image_prompt: mode === 'insert_me' && hasImage
      ? `Close-up portrait of a person centered in the frame facing the camera with an expressive shocked excited face, mouth slightly open, eyes wide, pointing at camera or gesturing dramatically, occupying 50% of the frame, all important content in the center away from edges, professional YouTube thumbnail style, dramatic cinematic lighting, vibrant saturated colours, high contrast, dynamic background related to: ${video_title}`
      : `Professional YouTube thumbnail, all key subjects centered in the frame with safe margins from edges, dramatic cinematic lighting, vibrant saturated colours, high contrast, dynamic composition, topic: ${video_title}`,
    overlay_text: custom_text || video_title.split(/\s+/).slice(0, 4).join(' ').toUpperCase(),
    text_position: 'bottom',
    text_color: '#FFFFFF',
    text_stroke_color: '#000000',
  };
}

async function falQueue(env, model, input) {
  const logInput = { ...input };
  if (logInput.image_url) logInput.image_url = logInput.image_url.slice(0, 60) + '...';
  if (logInput.reference_images) logInput.reference_images = logInput.reference_images.map(i => ({ image_url: (i.image_url || '').slice(0, 60) + '...' }));
  console.log(`[gen] submit ${model}:`, JSON.stringify(logInput));

  const sub = await fetch(`${FAL_QUEUE}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!sub.ok) {
    const errBody = await sub.text();
    console.error(`[gen] submit ${model} ${sub.status}:`, errBody);
    throw new Error(`fal submit ${sub.status}: ${errBody.slice(0, 300)}`);
  }

  const { status_url, response_url } = await sub.json();
  if (!status_url || !response_url) throw new Error('fal.ai missing queue URLs');

  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    const sr = await fetch(status_url, {
      headers: { Authorization: `Key ${env.FAL_KEY}` },
    });
    if (!sr.ok) continue;
    const sd = await sr.json();
    console.log(`[gen] ${model}:`, sd.status);
    if (sd.status === 'COMPLETED') {
      const rr = await fetch(response_url, {
        method: 'GET',
        headers: {
          Authorization: `Key ${env.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (!rr.ok) {
        const errBody = await rr.text();
        console.error(`[gen] result fetch ${rr.status}:`, errBody);
        throw new Error(`fal result ${rr.status}: ${errBody.slice(0, 200)}`);
      }
      return rr.json();
    }
    if (sd.status === 'FAILED') throw new Error(sd.error || 'Generation failed');
  }
  throw new Error('Timeout — generation exceeded 2 minutes');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
