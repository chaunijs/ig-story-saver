console.log("Insta Downloader: API-Scraping Architecture Loaded (Single Story Fix)!");

const getFormattedDate = () => {
  const d = new Date();
  const mo = d.getMonth() + 1; const da = d.getDate(); const yr = d.getFullYear();
  let hr = d.getHours(); const mi = d.getMinutes().toString().padStart(2, '0');
  const se = d.getSeconds().toString().padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12; hr = hr ? hr : 12;
  return `${mo}_${da}_${yr}_${hr}_${mi}_${se}_${ampm}`;
};

const triggerDownload = async (url, filename, btn) => {
  if (!url) { alert('Could not locate media URL.'); return; }
  const originalText = btn ? btn.innerText : '';
  
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
       btn.innerText = originalText || 'Download';
       btn.style.backgroundColor = '#1ed760';
       btn.disabled = false;
    }
  }
};

// --- THE SECRET SAUCE: INSTAGRAM API SCRAPER ---
const fetchStoryFromAPI = async (username, storyId) => {
  try {
    const IG_APP_ID = '936619743392459'; 

    // 1. Convert Username to internal User ID
    const profileRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      headers: { 'X-IG-App-ID': IG_APP_ID }
    });
    const profileData = await profileRes.json();
    const userId = profileData.data.user.id;

    // 2. Fetch the raw story JSON data for this user
    const reelsRes = await fetch(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`, {
      headers: { 'X-IG-App-ID': IG_APP_ID }
    });
    const reelsData = await reelsRes.json();
    const stories = reelsData.reels[userId].items;

    // 3. Find the exact story from the URL, or default to the FIRST story if no ID is present!
    let currentStory;
    if (storyId) {
        currentStory = stories.find(s => s.pk === storyId || s.id.includes(storyId));
    } else {
        currentStory = stories[0]; // The "Single Story" fallback
    }

    if (!currentStory) throw new Error("Story not found in API.");

    // 4. Extract the highest quality raw CDN link directly!
    const isVideo = currentStory.media_type === 2; 
    let rawUrl = isVideo 
        ? currentStory.video_versions[0].url 
        : currentStory.image_versions2.candidates[0].url; 

    // Return the resolved ID as well so we can name the file correctly
    return { url: rawUrl, isVideo: isVideo, resolvedId: currentStory.pk };

  } catch (error) {
    console.error("API Fetch Error:", error);
    return null;
  }
};

// --- STORY UI LOGIC ---
const setupStoryButton = () => {
  let storyBtn = document.getElementById('global-story-dl-btn');
  if (!storyBtn) {
    storyBtn = document.createElement('button');
    storyBtn.id = 'global-story-dl-btn';
    storyBtn.innerText = 'Download Story';
    Object.assign(storyBtn.style, {
      position: 'fixed', top: '20px', right: '80px', zIndex: '999999',
      backgroundColor: '#1ed760', color: '#fff', border: 'none',
      padding: '10px 15px', borderRadius: '8px', cursor: 'pointer',
      fontWeight: 'bold', display: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    });

    storyBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();

      const urlParts = window.location.pathname.split('/').filter(Boolean);
      
      // Update: Only require 2 parts (stories + username). ID is now optional.
      if (urlParts[0] !== 'stories' || urlParts.length < 2) {
          alert('Could not detect username from URL.');
          return;
      }

      const username = urlParts[1];
      const storyId = urlParts.length >= 3 ? urlParts[2] : null; 

      storyBtn.innerText = 'Fetching API...'; 

      const mediaData = await fetchStoryFromAPI(username, storyId);

      if (!mediaData || !mediaData.url) {
         alert('API extraction failed. Instagram may have restricted the request.');
         storyBtn.innerText = 'Download Story';
         return;
      }

      // Use the ID we got back from the API to name the file
      const finalStoryId = mediaData.resolvedId || storyId || Date.now().toString();
      const filename = `${username}_story_${getFormattedDate()}_${finalStoryId}${mediaData.isVideo ? '.mp4' : '.jpg'}`;
      
      triggerDownload(mediaData.url, filename, storyBtn);
    });
    document.body.appendChild(storyBtn);
  }
  storyBtn.style.display = window.location.href.includes('/stories/') ? 'block' : 'none';
};

setInterval(() => setupStoryButton(), 1500);