console.log("Insta Downloader: Content script loaded v6 (Stable)!");

// --- HELPER FUNCTIONS ---

const getFormattedDate = () => {
  const d = new Date();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  const yr = d.getFullYear();
  let hr = d.getHours();
  const mi = d.getMinutes().toString().padStart(2, '0');
  const se = d.getSeconds().toString().padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  
  hr = hr % 12;
  hr = hr ? hr : 12;
  
  return `${mo}_${da}_${yr}_${hr}_${mi}_${se}_${ampm}`;
};

const triggerDownload = async (url, filename) => {
  if (!url) {
    alert('Could not locate media URL.');
    return;
  }

  try {
    // 1. Fetch the file directly within the page context to inherit Meta's security headers
    const response = await fetch(url);
    const blob = await response.blob();
    
    // 2. Convert the raw data into a local blob URL
    const blobUrl = URL.createObjectURL(blob);

    // 3. Create a temporary invisible link and click it to force the download
    const a = document.createElement('a');
    a.href = blobUrl;
    // Ensure filename has the correct extension based on the original URL
    const ext = url.includes('.mp4') || url.includes('video') ? '.mp4' : '.jpg';
    a.download = filename.endsWith(ext) ? filename : filename + ext;
    
    document.body.appendChild(a);
    a.click();
    
    // 4. Clean up the DOM and memory
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    
  } catch (error) {
    console.warn("Insta Downloader: Native fetch blocked. Falling back to background script.", error);
    
    // Fallback: If fetch is blocked, try the background script method
    try {
      chrome.runtime.sendMessage({ action: 'download', url: url, filename: filename });
    } catch (e) {
      alert("Extension connection lost. Please refresh the page to continue.");
      window.location.reload(); 
    }
  }
};

// --- STORY LOGIC ---
const setupStoryButton = () => {
  let storyBtn = document.getElementById('global-story-dl-btn');
  
  if (!storyBtn) {
    storyBtn = document.createElement('button');
    storyBtn.id = 'global-story-dl-btn';
    storyBtn.innerText = 'Download Story';
    
    Object.assign(storyBtn.style, {
      position: 'fixed',
      top: '20px',
      right: '80px', 
      zIndex: '999999', 
      backgroundColor: '#1ed760',
      color: '#fff',
      border: 'none',
      padding: '10px 15px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 'bold',
      display: 'none', 
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    });

    storyBtn.addEventListener('click', (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      
      const videos = Array.from(document.querySelectorAll('video'));
      const images = Array.from(document.querySelectorAll('img'));
      const activeVideo = videos.find(v => v.offsetParent !== null); 
      const activeImage = images.find(img => img.offsetParent !== null && img.clientWidth > 200 && !img.src.includes('profile_pic'));
      
      let username = 'user';
      let storyId = Date.now().toString();
      const urlParts = window.location.pathname.split('/').filter(Boolean); 
      
      if (urlParts[0] === 'stories' && urlParts.length >= 2) {
        username = urlParts[1];
        if (urlParts.length >= 3) storyId = urlParts[2];
      }
      
      const filename = `${username}_story_${getFormattedDate()}_${storyId}`;
      
      if (activeVideo) {
        triggerDownload(activeVideo.src || activeVideo.currentSrc, filename);
      } else if (activeImage) {
        triggerDownload(activeImage.src, filename);
      } else {
        alert('Could not locate the active story media.');
      }
    });

    document.body.appendChild(storyBtn);
  }

  storyBtn.style.display = window.location.href.includes('/stories/') ? 'block' : 'none';
};

// --- FEED POST LOGIC ---
const injectFeedButtons = () => {
  document.querySelectorAll('article').forEach((post) => {
    if (!post.querySelector('.custom-dl-btn')) {
      const btn = document.createElement('button');
      btn.innerText = 'Download';
      btn.className = 'custom-dl-btn';
      Object.assign(btn.style, {
        position: 'absolute',
        top: '15px', right: '15px', zIndex: '99',
        backgroundColor: '#1ed760', color: '#fff',
        border: 'none', padding: '8px 12px',
        borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
      });

      post.style.position = 'relative';
      post.appendChild(btn);
      
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        
        let username = 'ig_post';
        let postId = Date.now().toString();
        const headerLinks = post.querySelectorAll('header a');
        for (let link of headerLinks) {
          if (link.textContent?.trim()) { username = link.textContent.trim(); break; }
        }
        const timeLink = post.querySelector('a[href*="/p/"]');
        if (timeLink) {
          const match = timeLink.href.match(/\/p\/([^\/]+)/);
          if (match) postId = match[1];
        }

        const filename = `${username}_${getFormattedDate()}_${postId}`;
        const media = post.querySelector('video, img[style*="object-fit: cover"]');
        triggerDownload(media ? media.src : null, filename);
      });
    }
  });
};

setInterval(() => {
  setupStoryButton();
  injectFeedButtons();
}, 1500);