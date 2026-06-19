document.getElementById('downloadBtn').addEventListener('click', async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getStoryMedia
  });
});

function getStoryMedia() {
  // Logic to find video or image tags on the current Instagram page
  const video = document.querySelector('video');
  const img = document.querySelector('img[src*="instagram"]');
  
  const url = video ? video.src : (img ? img.src : null);
  
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'story_media.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    alert("Could not find media in this story.");
  }
}