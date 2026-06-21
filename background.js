function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {

    const isVideo = request.filename.endsWith('.mp4');

    // Videos bypass the Base64 proxy completely to prevent RAM crashes
    if (isVideo) {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename
        });
        return;
    }

    // Image Base64 Proxy Backup
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return response.arrayBuffer().then(buffer => ({ buffer, contentType }));
      })
      .then(({ buffer, contentType }) => {
        const base64 = arrayBufferToBase64(buffer);
        const dataUrl = `data:${contentType};base64,${base64}`;

        chrome.downloads.download({
          url: dataUrl,
          filename: request.filename
        });
      })
      .catch(error => {
        console.error("Insta Downloader - Proxy failed:", error);
        chrome.downloads.download({ url: request.url, filename: request.filename });
      });
  }
});