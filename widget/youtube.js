(function () {
  "use strict";

  var YOUTUBE_PATTERNS = [
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\/)([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];

  var OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

  function extractVideoId(url) {
    if (!url || typeof url !== "string") return null;
    for (var i = 0; i < YOUTUBE_PATTERNS.length; i++) {
      var match = url.match(YOUTUBE_PATTERNS[i]);
      if (match) return match[1];
    }
    return null;
  }

  function isValidYouTubeUrl(url) {
    return extractVideoId(url) !== null;
  }

  function upgradeThumbUrl(thumbUrl) {
    if (!thumbUrl) return thumbUrl;
    return thumbUrl.replace(/\/hqdefault\.jpg/, "/maxresdefault.jpg");
  }

  async function fetchVideoData(url) {
    var videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    var endpoint =
      OEMBED_ENDPOINT +
      "?url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + videoId) +
      "&format=json";

    var res;
    try {
      res = await fetch(endpoint);
    } catch (e) {
      throw new Error("Video not found or private");
    }

    if (!res.ok) throw new Error("Video not found or private");

    var data = await res.json();

    return {
      id: videoId,
      title: data.title || "",
      author: data.author_name || "",
      thumbnail_url: upgradeThumbUrl(data.thumbnail_url),
      description: "",
    };
  }

  window.YouTubeParser = {
    extractVideoId: extractVideoId,
    isValidYouTubeUrl: isValidYouTubeUrl,
    fetchVideoData: fetchVideoData,
  };
})();
