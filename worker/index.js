const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const FAL_BASE_URL = 'https://queue.fal.run/fal-ai/flux/dev';
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60000;
const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 720;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
  'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'not',
  'no', 'so', 'if', 'as', 'just', 'about', 'up', 'out', 'into', 'than',
  'then', 'also', 'very', 'how', 'what', 'when', 'where', 'who', 'which',
]);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/generate' && request.method === 'POST') {
      return handleGenerate(request, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

async function handleGenerate(request, env) {
  if (!env.FAL_KEY) {
    return jsonResponse({ error: 'Server misconfigured', details: 'FAL_KEY is not set' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON', details: 'Request body must be valid JSON' }, 400);
  }

  const { image_url, video_title, video_description, custom_text } = body;

  if (!video_title && !custom_text) {
    return jsonResponse(
      { error: 'Bad request', details: 'At least video_title or custom_text is required' },
      400,
    );
  }

  const prompt = buildPrompt({ image_url, video_title, video_description, custom_text });
  console.log('[thumbnail-generator] Final prompt:', prompt);

  const falInput = {
    prompt,
    image_size: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
    num_images: 1,
  };

  if (image_url) {
    falInput.image_url = image_url;
  }

  try {
    const submitRes = await fetch(FAL_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Key ${env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falInput),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return jsonResponse(
        { error: 'fal.ai submission failed', details: errText },
        submitRes.status,
      );
    }

    const submitData = await submitRes.json();

    if (submitData.images && submitData.images.length > 0) {
      return jsonResponse({ image_url: submitData.images[0].url });
    }

    if (!submitData.request_id) {
      return jsonResponse(
        { error: 'Unexpected fal.ai response', details: 'No request_id or images returned' },
        502,
      );
    }

    const resultUrl = `${FAL_BASE_URL}/requests/${submitData.request_id}`;
    const statusUrl = `${resultUrl}/status`;
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${env.FAL_KEY}` },
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        return jsonResponse(
          { error: 'fal.ai status check failed', details: errText },
          statusRes.status,
        );
      }

      const statusData = await statusRes.json();
      console.log('[thumbnail-generator] Poll status:', statusData.status);

      if (statusData.status === 'COMPLETED') {
        const resultRes = await fetch(resultUrl, {
          headers: { Authorization: `Key ${env.FAL_KEY}` },
        });

        if (!resultRes.ok) {
          const errText = await resultRes.text();
          return jsonResponse(
            { error: 'fal.ai result fetch failed', details: errText },
            resultRes.status,
          );
        }

        const resultData = await resultRes.json();

        if (resultData.images && resultData.images.length > 0) {
          return jsonResponse({ image_url: resultData.images[0].url });
        }

        return jsonResponse(
          { error: 'No images in result', details: JSON.stringify(resultData) },
          502,
        );
      }

      if (statusData.status === 'FAILED') {
        return jsonResponse(
          { error: 'Generation failed', details: statusData.error || 'Unknown fal.ai error' },
          502,
        );
      }
    }

    return jsonResponse({ error: 'Timeout', details: 'Generation took longer than 60 seconds' }, 504);
  } catch (err) {
    return jsonResponse({ error: 'Internal error', details: err.message }, 500);
  }
}

function buildPrompt({ image_url, video_title, video_description, custom_text }) {
  const parts = [
    'YouTube thumbnail, 16:9 aspect ratio, bold text overlay,',
    'dramatic lighting, high contrast, vibrant colors,',
    'professional thumbnail style, photorealistic',
  ];

  if (video_title) {
    parts.push(`theme: ${video_title}`);
  }

  if (video_description) {
    const keywords = extractKeywords(video_description);
    if (keywords.length > 0) {
      parts.push(`context: ${keywords.join(', ')}`);
    }
  }

  if (custom_text) {
    parts.push(`text on thumbnail: '${custom_text}'`);
  } else if (video_title) {
    const autoText = video_title.split(/\s+/).slice(0, 6).join(' ').toUpperCase();
    parts.push(`text on thumbnail: '${autoText}'`);
  }

  if (image_url) {
    parts.push(
      'person from the reference photo, face clearly visible, same person as in reference',
    );
  }

  return parts.join('. ');
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 10);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
