console.log("Insta Downloader: API Architecture + Proximity Targeter + Clean Filenames Loaded!");

const getFormattedDate = () => {
  // Returns only the clean date component (MM_DD_YYYY) with no time stamps
  const d = new Date();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  const yr = d.getFullYear();
  
  return `${mo}_${da}_${yr}`;
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

// --- API SCRAPER (Precision targeting + First Story Safeguard) ---
const fetchStoryFromAPI = async (username, storyOrHighlightId, isHighlight, returnAll = false, specificHighlightItemId = null) => {
  try {
    const IG_APP_ID = '936619743392459'; 
    let reelsUrl = '';
    let objectKey = '';

    if (isHighlight) {
        reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight:${storyOrHighlightId}`;
        objectKey = `highlight:${storyOrHighlightId}`;
    } else {
        let userId = null;
        try {
            const profileRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
              headers: { 'X-IG-App-ID': IG_APP_ID }
            });
            if (profileRes.ok) {
                const profileData = await profileRes.json();
                userId = profileData.data.user.id;
            }
        } catch (e) {}
        
        if (!userId) {
            try {
                const pageRes = await fetch(`https://www.instagram.com/${username}/`);
                const html = await pageRes.text();
                const match = html.match(/"profile_id":"(\d+)"/);
                if (match && match[1]) userId = match[1];
            } catch (e) {}
        }

        if (!userId) throw new Error("Could not find user ID.");

        reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
        objectKey = userId.toString();
    }

    const reelsRes = await fetch(reelsUrl, { headers: { 'X-IG-App-ID': IG_APP_ID } });
    const reelsData = await reelsRes.json();
    
    if (!reelsData.reels || !reelsData.reels[objectKey]) {
        throw new Error("Collection not found in API.");
    }
    
    const stories = reelsData.reels[objectKey].items;

    if (returnAll) {
        return stories.map(s => {
            const isVideo = s.media_type === 2;
            const rawUrl = isVideo ? s.video_versions[0].url : s.image_versions2.candidates[0].url;
            return { url: rawUrl, isVideo: isVideo, resolvedId: s.pk };
        });
    }

    let currentStory = null;
    
    if (isHighlight && specificHighlightItemId) {
        currentStory = stories.find(s => s.pk.toString() === specificHighlightItemId.toString() || s.id.includes(specificHighlightItemId.toString()));
    } else if (!isHighlight && storyOrHighlightId) {
        currentStory = stories.find(s => s.pk.toString() === storyOrHighlightId.toString() || s.id.includes(storyOrHighlightId.toString()));
    } else {
        currentStory = stories[0];
    }

    if (!currentStory) throw new Error("Story not found in API.");

    const isVideo = currentStory.media_type === 2; 
    let rawUrl = isVideo ? currentStory.video_versions[0].url : currentStory.image_versions2.candidates[0].url; 
    return { url: rawUrl, isVideo: isVideo, resolvedId: currentStory.pk };

  } catch (error) {
    console.log("API Fetch Note:", error.message);
    return null;
  }
};

// --- DOM SCRAPER (Proximity Center Targeter) ---
const extractMediaFromDOM = () => {
    const centerX = window.innerWidth / 2;
    const mediaElements = Array.from(document.querySelectorAll('video, img'));
    
    let closestElement = null;
    let minDistance = Infinity;
    let bestUrl = '';
    let isVideo = false;
    
    mediaElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        
        if (rect.width > 200 && rect.height > 200 && !el.src?.includes('profile_pic')) {
            let url = el.src || el.currentSrc;
            if (!url && el.hasAttribute('srcset')) {
                url = el.getAttribute('srcset').split(',')[0].trim().split(' ')[0];
            }
            
            const tag = el.tagName.toLowerCase();
            let elIsVideo = (tag === 'video');
            
            if (tag === 'video' && (!url || url.startsWith('blob'))) {
                const source = el.querySelector('source');
                if (source) url = source.src;
                
                if (!url || url.startsWith('blob')) {
                    url = el.poster;
                    elIsVideo = false; // Fallback to saving the poster image
                }
            }
            
            if (url && !url.startsWith('blob')) {
                const elCenter = rect.left + (rect.width / 2);
                const distance = Math.abs(elCenter - centerX);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestElement = el;
                    bestUrl = url;
                    isVideo = elIsVideo;
                }
            }
        }
    });
    
    if (closestElement && bestUrl) {
        return { url: bestUrl, isVideo: isVideo };
    }
    return null;
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
      let specificHighlightItemId = urlParts.length >= 4 ? urlParts[3] : null;

      if (isHighlight) {
          const userLink = document.querySelector('header a');
          username = userLink ? userLink.textContent.trim() : 'highlight';
      }

      btnCurrent.innerText = 'Fetching...'; 
      let mediaData = null;

      mediaData = await fetchStoryFromAPI(username, storyId, isHighlight, false, specificHighlightItemId);

      if (!mediaData || !mediaData.url) {
          mediaData = extractMediaFromDOM();
          if (mediaData) mediaData.resolvedId = specificHighlightItemId || storyId || Date.now().toString();
      }

      if (!mediaData || !mediaData.url) {
         alert('Extraction failed. Could not find active media on screen.');
         btnCurrent.innerText = 'Download Current';
         return;
      }

      const finalStoryId = mediaData.resolvedId || storyId || Date.now().toString();
      const currentDate = getFormattedDate();
      
      const filename = `${username}_story_${currentDate}_${finalStoryId}${mediaData.isVideo ? '.mp4' : '.jpg'}`;
      
      triggerDownload(mediaData.url, filename, btnCurrent, 'Download Current');
    });

    // --- LOGIC FOR DOWNLOAD ALL ---
    btnAll.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const urlParts = window.location.pathname.split('/').filter(Boolean);
        if (urlParts[0] !== 'stories' || urlParts.length < 2) return;
        
        let username = urlParts[1];
        let isHighlight = username === 'highlights';
        let storyOrHighlightId = urlParts.length >= 3 ? urlParts[2] : null;
        
        if (isHighlight) {
            const userLink = document.querySelector('header a');
            username = userLink ? userLink.textContent.trim() : 'highlight';
        }
        
        btnAll.disabled = true;
        btnAll.style.backgroundColor = '#fbbc05';

        try {
            btnAll.innerText = 'Fetching Array...';
            const allMedia = await fetchStoryFromAPI(username, storyOrHighlightId, isHighlight, true);

            if (!allMedia || allMedia.length === 0) {
                alert("No media found or API restricted.");
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
            alert("An error occurred while downloading stories.");
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