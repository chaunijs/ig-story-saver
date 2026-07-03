console.log("Insta Downloader: API Architecture + Download All + Edge UI Loaded!");

// --- BRINGING BACK YOUR DATE FORMATTER ---
const getFormattedDate = () => {
  const d = new Date();
  const mo = d.getMonth() + 1; const da = d.getDate(); const yr = d.getFullYear();
  let hr = d.getHours(); const mi = d.getMinutes().toString().padStart(2, '0');
  const se = d.getSeconds().toString().padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12; hr = hr ? hr : 12;
  return `${mo}_${da}_${yr}_${hr}_${mi}_${se}_${ampm}`;
};

const triggerDownload = async (url, filename, btn, originalTextOverride) => {
  if (!url) { alert('Could not locate media URL.'); return; }
  
  const originalText = btn ? (originalTextOverride || btn.innerText) : '';
  
  if (btn) {
     btn.innerText = 'Downloading...';
     btn.style.backgroundColor = '#fbbc05'; 
     btn.disabled = true;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    chrome.runtime.sendMessage({ action: 'download', url: url, filename: filename });
  } finally {
    if (btn) {
       btn.innerText = originalText;
       btn.style.backgroundColor = '#1ed760';
       btn.disabled = false;
    }
  }
};

// --- API SCRAPER (For 24h Stories) ---
const fetchStoryFromAPI = async (username, storyId, returnAll = false) => {
  try {
    const IG_APP_ID = '936619743392459'; 

    const profileRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      headers: { 'X-IG-App-ID': IG_APP_ID }
    });
    const profileData = await profileRes.json();
    const userId = profileData.data.user.id;

    const reelsRes = await fetch(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`, {
      headers: { 'X-IG-App-ID': IG_APP_ID }
    });
    const reelsData = await reelsRes.json();
    const stories = reelsData.reels[userId].items;

    if (returnAll) {
        return stories.map(s => {
            const isVideo = s.media_type === 2;
            const rawUrl = isVideo ? s.video_versions[0].url : s.image_versions2.candidates[0].url;
            return { url: rawUrl, isVideo: isVideo, resolvedId: s.pk };
        });
    }

    let currentStory = storyId ? stories.find(s => s.pk === storyId || s.id.includes(storyId)) : stories[0];
    if (!currentStory) throw new Error("Story not found in API.");

    const isVideo = currentStory.media_type === 2; 
    let rawUrl = isVideo ? currentStory.video_versions[0].url : currentStory.image_versions2.candidates[0].url; 
    return { url: rawUrl, isVideo: isVideo, resolvedId: currentStory.pk };

  } catch (error) {
    console.error("API Fetch Error:", error);
    return null;
  }
};

// --- DOM SCRAPER (Fallback for Highlights) ---
const extractMediaFromDOM = () => {
    const video = document.querySelector('video');
    if (video && video.src && !video.src.startsWith('blob')) return { url: video.src, isVideo: true };
    
    const imgs = Array.from(document.querySelectorAll('img[srcset]')).filter(img => img.src.includes('scontent'));
    if (imgs.length > 0) {
        return { url: imgs[imgs.length - 1].src, isVideo: false };
    }
    return null;
};

// --- EXTRACT TIME PASSED (Broader Search) ---
const getStoryTimeSuffix = () => {
    // Look for ANY <time> tag on the screen instead of just in the header
    const timeElement = document.querySelector('time');
    if (timeElement && timeElement.textContent) {
        return `(-${timeElement.textContent.trim().replace(/\s+/g, '-')})`;
    }
    return '';
};

// --- STORY UI LOGIC ---
const setupStoryButton = () => {
  let container = document.getElementById('ig-story-dl-container');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'ig-story-dl-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '30px', 
      left: 'calc(50% + 250px)', 
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    });

    const btnStyle = {
      backgroundColor: '#1ed760', color: '#fff', border: 'none',
      padding: '10px 15px', borderRadius: '8px', cursor: 'pointer',
      fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      transition: 'background-color 0.2s', whiteSpace: 'nowrap'
    };

    const btnCurrent = document.createElement('button');
    btnCurrent.innerText = 'Download Current';
    Object.assign(btnCurrent.style, btnStyle);

    const btnAll = document.createElement('button');
    btnAll.innerText = 'Download All';
    Object.assign(btnAll.style, btnStyle);

    container.appendChild(btnCurrent);
    container.appendChild(btnAll);
    document.body.appendChild(container);

    // --- LOGIC FOR SINGLE DOWNLOAD ---
    btnCurrent.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const urlParts = window.location.pathname.split('/').filter(Boolean);
      if (urlParts[0] !== 'stories' || urlParts.length < 2) return;
      
      let username = urlParts[1];
      let storyId = urlParts.length >= 3 ? urlParts[2] : null; 
      let isHighlight = username === 'highlights';

      if (isHighlight) {
          const userLink = document.querySelector('header a');
          username = userLink ? userLink.textContent.trim() : 'highlight';
      }

      btnCurrent.innerText = 'Fetching...'; 
      let mediaData = null;

      if (!isHighlight) {
          mediaData = await fetchStoryFromAPI(username, storyId, false);
      }

      if (!mediaData || !mediaData.url) {
          mediaData = extractMediaFromDOM();
          if (mediaData) mediaData.resolvedId = storyId || Date.now().toString();
      }

      if (!mediaData || !mediaData.url) {
         alert('Extraction failed. Could not find media on screen or via API.');
         btnCurrent.innerText = 'Download Current';
         return;
      }

      const finalStoryId = mediaData.resolvedId || storyId || Date.now().toString();
      const timePassed = getStoryTimeSuffix();
      const currentDate = getFormattedDate();
      
      // Filename will now include both the "(-6h)" AND the current computer date
      const filename = `${username}_story${timePassed}_${currentDate}_${finalStoryId}${mediaData.isVideo ? '.mp4' : '.jpg'}`;
      
      triggerDownload(mediaData.url, filename, btnCurrent, 'Download Current');
    });

    // --- LOGIC FOR DOWNLOAD ALL ---
    btnAll.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const urlParts = window.location.pathname.split('/').filter(Boolean);
        if (urlParts[0] !== 'stories' || urlParts.length < 2) return;
        
        let username = urlParts[1];
        if (username === 'highlights') {
            alert("'Download All' relies on the Instagram API and only works for active 24-hour stories. Please use 'Download Current' for highlights.");
            return;
        }
        
        btnAll.disabled = true;
        btnAll.style.backgroundColor = '#fbbc05';

        try {
            btnAll.innerText = 'Fetching Array...';
            const allMedia = await fetchStoryFromAPI(username, null, true);

            if (!allMedia || allMedia.length === 0) {
                alert("No stories found or API restricted.");
                return;
            }

            for (let i = 0; i < allMedia.length; i++) {
                const media = allMedia[i];
                btnAll.innerText = `Saving (${i + 1}/${allMedia.length})`;
                
                const currentDate = getFormattedDate();
                const filename = `${username}_story_${currentDate}_${media.resolvedId}${media.isVideo ? '.mp4' : '.jpg'}`;
                
                await triggerDownload(media.url, filename, null, null);
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred while downloading all stories.");
        } finally {
            btnAll.innerText = 'Download All';
            btnAll.style.backgroundColor = '#1ed760';
            btnAll.disabled = false;
        }
    });
  }
  
  container.style.display = window.location.href.includes('/stories/') ? 'flex' : 'none';
};

setInterval(() => setupStoryButton(), 1500);