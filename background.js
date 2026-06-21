chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    
    // Determine file extension based on the URL content
    const isVideo = request.url.includes('.mp4') || request.url.includes('video');
    const extension = isVideo ? '.mp4' : '.jpg';

    // Use the custom filename sent from content.js, or fallback to a timestamp
    let finalFilename = request.filename ? request.filename : `ig_download_${Date.now()}`;
    
    // Ensure the extension is attached
    if (!finalFilename.endsWith(extension)) {
        finalFilename += extension;
    }

    // Trigger Chrome's native download API with the new name
    chrome.downloads.download({
      url: request.url,
      filename: finalFilename
    });
  }
});