// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    
    // Determine a generic filename based on the URL string
    const isVideo = request.url.includes('.mp4');
    const extension = isVideo ? '.mp4' : '.jpg';
    const filename = `ig_download_${Date.now()}${extension}`;

    // Trigger Chrome's native download API
    chrome.downloads.download({
      url: request.url,
      filename: filename
    });
  }
});