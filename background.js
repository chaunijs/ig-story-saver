function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const sanitizeFilename = (name) => {
  return (name || 'instagram_story')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    const filename = sanitizeFilename(request.filename);
    const isVideo = filename.endsWith('.mp4');

    // Videos download directly via Chrome downloads manager
    if (isVideo) {
      chrome.downloads.download({
        url: request.url,
        filename: filename,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Insta Downloader download error:", chrome.runtime.lastError.message);
        }
      });
      return;
    }

    // Image Base64 Proxy Backup
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        return response.arrayBuffer().then(buffer => ({ buffer, contentType }));
      })
      .then(({ buffer, contentType }) => {
        const base64 = arrayBufferToBase64(buffer);
        const dataUrl = `data:${contentType};base64,${base64}`;

        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          conflictAction: 'uniquify'
        });
      })
      .catch(error => {
        console.warn("Insta Downloader - Base64 proxy fallback to direct URL:", error);
        chrome.downloads.download({
          url: request.url,
          filename: filename,
          conflictAction: 'uniquify'
        });
      });
  }
});