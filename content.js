console.log("Insta Downloader: Hybrid MAIN-World Interceptor + DOM Analyzer Loaded!");

// Inject MAIN world script as a backup to manifest declaration
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
} catch (e) {}

const getFormattedDate = () => {
  const d = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const yr = d.getFullYear();
  return `${mo}_${da}_${yr}`;
};

const sanitizeFilename = (name) => {
  return (name || 'instagram_story')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
};

const triggerDownload = (url, filename, btn, originalTextOverride) => {
  if (!url) {
    alert('Could not locate media URL.');
    return;
  }

  const originalText = btn ? (originalTextOverride || btn.innerText) : '';

  if (btn) {
    btn.innerText = 'Downloading...';
    btn.style.backgroundColor = '#fbbc05';
    btn.disabled = true;
  }

  try {
    chrome.runtime.sendMessage({
      action: 'download',
      url: url,
      filename: filename
    });

    if (btn) {
      setTimeout(() => {
        btn.innerText = 'Saved!';
        btn.style.backgroundColor = '#1ed760';
        setTimeout(() => {
          btn.innerText = originalText;
          btn.disabled = false;
        }, 1500);
      }, 600);
    }
  } catch (error) {
    console.error("Insta Downloader: Trigger download error:", error);
    if (btn) {
      btn.innerText = originalText;
      btn.style.backgroundColor = '#1ed760';
      btn.disabled = false;
    }
  }
};

// --- COMMUNICATE WITH MAIN-WORLD INJECTED SCRIPT ---
const requestFromMainWorld = (action, payload = {}, timeoutMs = 3500) => {
  return new Promise((resolve) => {
    const requestId = 'req_' + Math.random().toString(36).slice(2) + Date.now();
    let timer = null;

    const handler = (event) => {
      if (event.data?.source === '__IG_SAVER_MAIN__' && event.data?.requestId === requestId) {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.data);
      }
    };

    window.addEventListener('message', handler);
    window.postMessage({
      source: '__IG_SAVER_CONTENT__',
      requestId,
      action,
      ...payload
    }, '*');

    timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeoutMs);
  });
};

// --- DOM SCRAPER (Best candidate extraction) ---
const parseBestFromSrcset = (srcsetString) => {
  if (!srcsetString) return '';
  const entries = srcsetString.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
  if (entries.length === 0) return '';

  entries.sort((a, b) => {
    const wA = parseInt(a[1]) || 0;
    const wB = parseInt(b[1]) || 0;
    return wB - wA;
  });
  return entries[0][0];
};

const extractMediaFromDOM = () => {
  const storySection = document.querySelector('section');
  const root = storySection || document;
  const centerX = window.innerWidth / 2;
  const mediaElements = Array.from(root.querySelectorAll('video, img'));

  let closestElement = null;
  let minDistance = Infinity;
  let bestUrl = '';
  let isVideo = false;

  mediaElements.forEach(el => {
    const rect = el.getBoundingClientRect();

    if (rect.width > 120 && rect.height > 120 && !el.src?.includes('profile_pic') && !el.src?.includes('s150x150')) {
      const tag = el.tagName.toLowerCase();
      let url = el.currentSrc || el.src || '';

      if (tag === 'img' && el.hasAttribute('srcset')) {
        const bestSrc = parseBestFromSrcset(el.getAttribute('srcset'));
        if (bestSrc) url = bestSrc;
      }

      let elIsVideo = (tag === 'video');

      if (tag === 'video') {
        const source = el.querySelector('source');
        if (source && source.src && !source.src.startsWith('blob:')) {
          url = source.src;
        } else if ((!url || url.startsWith('blob:')) && el.poster) {
          url = el.poster;
          elIsVideo = false;
        }
      }

      if (url && !url.startsWith('blob:')) {
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

// --- API SCRAPER FALLBACK ---
const getCsrfToken = () => {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
};

const fetchStoryFromAPI = async (username, storyOrHighlightId, isHighlight, returnAll = false, specificHighlightItemId = null) => {
  try {
    const IG_APP_ID = '936619743392459';
    const headers = {
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*'
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;

    let reelsUrl = '';
    let objectKey = '';

    if (isHighlight) {
      const cleanHId = (storyOrHighlightId || '').replace(/^highlight:/, '');
      reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight:${cleanHId}`;
      objectKey = `highlight:${cleanHId}`;
    } else {
      let userId = null;

      // 1. Topsearch API
      try {
        const searchRes = await fetch(`https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(username)}`, {
          headers: headers,
          credentials: 'include'
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (Array.isArray(searchData?.users)) {
            const match = searchData.users.find(u => u.user?.username?.toLowerCase() === username.toLowerCase());
            if (match?.user?.pk || match?.user?.id) {
              userId = (match.user.pk || match.user.id).toString();
            }
          }
        }
      } catch (e) {}

      // 2. Web Profile Info
      if (!userId) {
        try {
          const profileRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
            headers: headers,
            credentials: 'include'
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            userId = profileData?.data?.user?.id?.toString();
          }
        } catch (e) {}
      }

      // 3. Strict script match
      if (!userId) {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const content = s.textContent || '';
          const match = content.match(new RegExp(`"${username}"[\\s\\S]*?"id":"(\\d+)"`)) ||
                        content.match(new RegExp(`"id":"(\\d+)"[\\s\\S]*?"${username}"`));
          if (match && match[1]) {
            userId = match[1];
            break;
          }
        }
      }

      if (!userId) return null;

      reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
      objectKey = userId.toString();
    }

    const reelsRes = await fetch(reelsUrl, {
      headers: headers,
      credentials: 'include'
    });
    if (!reelsRes.ok) return null;

    const reelsData = await reelsRes.json();
    const reelObj = reelsData?.reels?.[objectKey] || reelsData?.reels?.[Object.keys(reelsData?.reels || {})[0]] || reelsData?.reels_media?.[0];
    if (!reelObj || !Array.isArray(reelObj.items) || reelObj.items.length === 0) {
      return null;
    }

    const stories = reelObj.items;

    if (returnAll) {
      return stories.map(s => {
        const isVideo = s.media_type === 2 || !!(s.video_versions && s.video_versions.length > 0);
        let rawUrl = '';
        if (isVideo && s.video_versions?.length > 0) {
          const sorted = [...s.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
          rawUrl = sorted[0].url;
        } else if (s.image_versions2?.candidates?.length > 0) {
          const sorted = [...s.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
          rawUrl = sorted[0].url;
        }
        return { url: rawUrl, isVideo: isVideo, resolvedId: (s.pk || s.id).toString(), username: username };
      }).filter(x => x.url);
    }

    let currentStory = null;

    if (isHighlight && specificHighlightItemId) {
      currentStory = stories.find(s => s.pk.toString() === specificHighlightItemId.toString() || s.id.includes(specificHighlightItemId.toString()));
    } else if (!isHighlight && storyOrHighlightId) {
      currentStory = stories.find(s => s.pk.toString() === storyOrHighlightId.toString() || s.id.includes(storyOrHighlightId.toString()));
    } else {
      currentStory = stories[0];
    }

    if (!currentStory) return null;

    const isVideo = currentStory.media_type === 2 || !!(currentStory.video_versions && currentStory.video_versions.length > 0);
    let rawUrl = '';
    if (isVideo && currentStory.video_versions?.length > 0) {
      const sorted = [...currentStory.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
      rawUrl = sorted[0].url;
    } else if (currentStory.image_versions2?.candidates?.length > 0) {
      const sorted = [...currentStory.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
      rawUrl = sorted[0].url;
    }

    return { url: rawUrl, isVideo: isVideo, resolvedId: (currentStory.pk || currentStory.id).toString(), username: username };
  } catch (error) {
    console.log("Insta Downloader: API Fetch note:", error.message);
    return null;
  }
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
      transition: 'background-color 0.2s', whiteSpace: 'nowrap',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px'
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
      e.preventDefault();
      e.stopPropagation();

      const urlParts = window.location.pathname.split('/').filter(Boolean);
      if (urlParts[0] !== 'stories' || urlParts.length < 2) return;

      let username = urlParts[1];
      let storyId = urlParts.length >= 3 ? urlParts[2] : null;
      let isHighlight = username === 'highlights';
      let specificHighlightItemId = urlParts.length >= 4 ? urlParts[3] : null;

      // Also check query param ?story_media_id=
      const searchMediaId = new URLSearchParams(window.location.search).get('story_media_id');
      if (searchMediaId) {
        specificHighlightItemId = searchMediaId;
      }

      if (isHighlight) {
        const userLink = document.querySelector('header a');
        username = userLink ? userLink.textContent.trim() : 'highlight';
      }

      btnCurrent.innerText = 'Locating Media...';
      btnCurrent.style.backgroundColor = '#fbbc05';

      let mediaData = null;

      // 1. Primary: Query MAIN-world script (has network cache + React Fiber inspection)
      mediaData = await requestFromMainWorld('GET_ACTIVE_MEDIA', {
        storyId,
        username,
        isHighlight,
        storyOrHighlightId: storyId,
        specificHighlightItemId
      });

      // 2. Secondary: Fallback to DOM inspection
      if (!mediaData || !mediaData.url) {
        mediaData = extractMediaFromDOM();
        if (mediaData) {
          mediaData.resolvedId = specificHighlightItemId || storyId || Date.now().toString();
        }
      }

      // 3. Tertiary: Fallback to direct API scraper
      if (!mediaData || !mediaData.url) {
        mediaData = await fetchStoryFromAPI(username, storyId, isHighlight, false, specificHighlightItemId);
      }

      if (!mediaData || !mediaData.url) {
        alert('Extraction failed. Could not find active media on screen.');
        btnCurrent.innerText = 'Download Current';
        btnCurrent.style.backgroundColor = '#1ed760';
        return;
      }

      const finalStoryId = mediaData.resolvedId || specificHighlightItemId || storyId || Date.now().toString();
      const currentDate = getFormattedDate();
      const ext = mediaData.isVideo ? '.mp4' : '.jpg';
      const rawFilename = `${username}_story_${currentDate}_${finalStoryId}${ext}`;
      const filename = sanitizeFilename(rawFilename);

      triggerDownload(mediaData.url, filename, btnCurrent, 'Download Current');
    });

    // --- LOGIC FOR DOWNLOAD ALL ---
    btnAll.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

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

        // 1. Query MAIN world cache and API
        let allMedia = await requestFromMainWorld('GET_ALL_MEDIA', {
          username,
          storyOrHighlightId,
          isHighlight,
          currentStoryId: (!isHighlight && storyOrHighlightId) ? storyOrHighlightId : null
        });

        // 2. Fallback to API scraper
        if (!allMedia || allMedia.length === 0) {
          allMedia = await fetchStoryFromAPI(username, storyOrHighlightId, isHighlight, true);
        }

        if (!allMedia || allMedia.length === 0) {
          alert("No media found or API restricted.");
          btnAll.innerText = 'Download All';
          btnAll.style.backgroundColor = '#1ed760';
          btnAll.disabled = false;
          return;
        }

        for (let i = 0; i < allMedia.length; i++) {
          const media = allMedia[i];
          btnAll.innerText = `Saving (${i + 1}/${allMedia.length})`;

          const currentDate = getFormattedDate();
          const ext = media.isVideo ? '.mp4' : '.jpg';
          const fileUser = media.username || username;
          const rawFilename = `${fileUser}_story_${currentDate}_${media.resolvedId || (i + 1)}${ext}`;
          const filename = sanitizeFilename(rawFilename);

          triggerDownload(media.url, filename, null, null);
          await new Promise(r => setTimeout(r, 600));
        }

        btnAll.innerText = 'All Saved!';
        btnAll.style.backgroundColor = '#1ed760';
        setTimeout(() => {
          btnAll.innerText = 'Download All';
          btnAll.disabled = false;
        }, 2000);
      } catch (err) {
        console.error("Insta Downloader: Download All error:", err);
        alert("An error occurred while downloading stories.");
        btnAll.innerText = 'Download All';
        btnAll.style.backgroundColor = '#1ed760';
        btnAll.disabled = false;
      }
    });
  }

  // Position adjuster & visibility
  if (container) {
    const isStories = window.location.href.includes('/stories/');
    container.style.display = isStories ? 'flex' : 'none';
  }
};

setInterval(() => setupStoryButton(), 1500);