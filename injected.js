(() => {
  if (window.__IG_DOWN_INJECTED__) return;
  window.__IG_DOWN_INJECTED__ = true;

  console.log("Insta Downloader: Injected MAIN world script active (Story-Only Mode).");

  // --- STRICT STORY MEDIA CACHE ---
  const mediaMapById = new Map();
  const mediaMapByUser = new Map();
  const mediaMapByHighlight = new Map();

  const getCsrfToken = () => {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  };

  const getHeaders = () => {
    const headers = {
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*'
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
    return headers;
  };

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

  const processStoryItem = (item, highlightId = null, fallbackUsername = '') => {
    if (!item || typeof item !== 'object') return null;

    const id = (item.pk || item.id || '').toString();
    if (!id) return null;

    let isVideo = item.media_type === 2 || !!(item.video_versions && item.video_versions.length > 0);
    let bestUrl = '';

    if (Array.isArray(item.video_versions) && item.video_versions.length > 0) {
      isVideo = true;
      const sorted = [...item.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
      bestUrl = sorted[0].url;
    } else if (item.image_versions2?.candidates && Array.isArray(item.image_versions2.candidates) && item.image_versions2.candidates.length > 0) {
      isVideo = false;
      const sorted = [...item.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
      bestUrl = sorted[0].url;
    } else if (Array.isArray(item.display_resources) && item.display_resources.length > 0) {
      isVideo = false;
      const sorted = [...item.display_resources].sort((a, b) => (b.config_width || 0) - (a.config_width || 0));
      bestUrl = sorted[0].src;
    } else if (item.display_url) {
      isVideo = false;
      bestUrl = item.display_url;
    }

    if (!bestUrl) return null;

    const username = (item.user?.username || item.owner?.username || fallbackUsername || '').toLowerCase();
    const entry = {
      id: id,
      resolvedId: id,
      url: bestUrl,
      isVideo: isVideo,
      username: username,
      takenAt: item.taken_at || 0
    };

    mediaMapById.set(id, entry);

    if (username) {
      if (!mediaMapByUser.has(username)) {
        mediaMapByUser.set(username, new Map());
      }
      mediaMapByUser.get(username).set(id, entry);
    }

    if (highlightId) {
      const cleanHId = highlightId.toString().replace(/^highlight:/, '');
      if (!mediaMapByHighlight.has(cleanHId)) {
        mediaMapByHighlight.set(cleanHId, new Map());
      }
      mediaMapByHighlight.get(cleanHId).set(id, entry);
    }

    return entry;
  };

  // Process story reel responses (supports REST, Tray, and GraphQL)
  const processStoryReelResponse = (data) => {
    if (!data || typeof data !== 'object') return;

    // 1. Structure: { reels: { [id]: { items: [...], user: {...} } } }
    if (data.reels && typeof data.reels === 'object') {
      for (const [key, reel] of Object.entries(data.reels)) {
        if (reel && Array.isArray(reel.items)) {
          const isHighlight = key.startsWith('highlight:') || (typeof reel.id === 'string' && reel.id.startsWith('highlight:'));
          const highlightId = isHighlight ? (reel.id || key) : null;
          const reelUser = reel.user?.username || reel.owner?.username || '';
          for (const item of reel.items) {
            processStoryItem(item, highlightId, reelUser);
          }
        }
      }
    }

    // 2. Structure: { reels_media: [ { id, items: [...], user: {...} } ] }
    if (Array.isArray(data.reels_media)) {
      for (const reel of data.reels_media) {
        if (reel && Array.isArray(reel.items)) {
          const isHighlight = typeof reel.id === 'string' && reel.id.startsWith('highlight:');
          const highlightId = isHighlight ? reel.id : null;
          const reelUser = reel.user?.username || reel.owner?.username || '';
          for (const item of reel.items) {
            processStoryItem(item, highlightId, reelUser);
          }
        }
      }
    }

    // 3. Structure: { tray: [ { id, items: [...], user: {...} } ] } (Story Tray API)
    if (Array.isArray(data.tray)) {
      for (const reel of data.tray) {
        if (reel && Array.isArray(reel.items)) {
          const isHighlight = typeof reel.id === 'string' && reel.id.startsWith('highlight:');
          const highlightId = isHighlight ? reel.id : null;
          const reelUser = reel.user?.username || reel.owner?.username || '';
          for (const item of reel.items) {
            processStoryItem(item, highlightId, reelUser);
          }
        }
      }
    }

    // 4. Structure: Single user story endpoint { reel: { items: [...], user: {...} } }
    if (data.reel && Array.isArray(data.reel.items)) {
      const reelUser = data.reel.user?.username || data.reel.owner?.username || '';
      for (const item of data.reel.items) {
        processStoryItem(item, null, reelUser);
      }
    }

    // 5. Structure: GraphQL queries
    const gqlReelsMedia = data.data?.xdt_api__v1__feed__reels_media?.reels_media ||
                          data.data?.reels_media;
    if (Array.isArray(gqlReelsMedia)) {
      for (const reel of gqlReelsMedia) {
        if (reel && Array.isArray(reel.items)) {
          const isHighlight = typeof reel.id === 'string' && reel.id.startsWith('highlight:');
          const highlightId = isHighlight ? reel.id : null;
          const reelUser = reel.user?.username || reel.owner?.username || '';
          for (const item of reel.items) {
            processStoryItem(item, highlightId, reelUser);
          }
        }
      }
    }

    const gqlTray = data.data?.xdt_api__v1__feed__reels_tray?.tray;
    if (Array.isArray(gqlTray)) {
      for (const reel of gqlTray) {
        if (reel && Array.isArray(reel.items)) {
          const isHighlight = typeof reel.id === 'string' && reel.id.startsWith('highlight:');
          const highlightId = isHighlight ? reel.id : null;
          const reelUser = reel.user?.username || reel.owner?.username || '';
          for (const item of reel.items) {
            processStoryItem(item, highlightId, reelUser);
          }
        }
      }
    }
  };

  // --- NETWORK INTERCEPTION ---
  const isTargetUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    return (
      url.includes('/api/v1/feed/reels_media') ||
      url.includes('/api/v1/feed/reels_tray') ||
      (url.includes('/api/v1/feed/user/') && url.includes('/story/')) ||
      url.includes('/graphql/query') ||
      url.includes('/api/graphql')
    );
  };

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (isTargetUrl(url)) {
        const clone = response.clone();
        clone.json().then(data => {
          processStoryReelResponse(data);
        }).catch(() => {});
      }
    } catch (e) {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._igUrl = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const url = this._igUrl || '';
        if (isTargetUrl(url) && this.responseText) {
          const data = JSON.parse(this.responseText);
          processStoryReelResponse(data);
        }
      } catch (e) {}
    });
    return originalSend.apply(this, args);
  };

  // --- REACT FIBER TRAVERSAL ---
  const getReactFiber = (dom) => {
    if (!dom) return null;
    const key = Object.keys(dom).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    return key ? dom[key] : null;
  };

  const getReactProps = (dom) => {
    if (!dom) return null;
    const key = Object.keys(dom).find(k => k.startsWith('__reactProps$'));
    return key ? dom[key] : null;
  };

  const extractMediaFromItemObject = (obj, depth = 0) => {
    if (!obj || depth > 4 || typeof obj !== 'object') return null;

    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      const sorted = [...obj.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
      return {
        url: sorted[0].url,
        isVideo: true,
        resolvedId: (obj.pk || obj.id || '').toString()
      };
    }

    if (obj.image_versions2?.candidates && Array.isArray(obj.image_versions2.candidates) && obj.image_versions2.candidates.length > 0) {
      const sorted = [...obj.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
      return {
        url: sorted[0].url,
        isVideo: false,
        resolvedId: (obj.pk || obj.id || '').toString()
      };
    }

    if (Array.isArray(obj.display_resources) && obj.display_resources.length > 0) {
      const sorted = [...obj.display_resources].sort((a, b) => (b.config_width || 0) - (a.config_width || 0));
      return {
        url: sorted[0].src,
        isVideo: false,
        resolvedId: (obj.pk || obj.id || '').toString()
      };
    }

    if (obj.display_url) {
      return {
        url: obj.display_url,
        isVideo: false,
        resolvedId: (obj.pk || obj.id || '').toString()
      };
    }

    for (const key of ['item', 'media', 'story', 'activeItem', 'currentStory']) {
      if (obj[key] && typeof obj[key] === 'object') {
        const res = extractMediaFromItemObject(obj[key], depth + 1);
        if (res) return res;
      }
    }

    return null;
  };

  const findMediaInFiberTree = (domElement) => {
    if (!domElement) return null;

    const props = getReactProps(domElement);
    if (props) {
      const res = extractMediaFromItemObject(props);
      if (res) return res;
    }

    let fiber = getReactFiber(domElement);
    let depth = 0;
    while (fiber && depth < 35) {
      if (fiber.memoizedProps) {
        const res = extractMediaFromItemObject(fiber.memoizedProps);
        if (res) return res;
      }
      if (fiber.memoizedState) {
        const res = extractMediaFromItemObject(fiber.memoizedState);
        if (res) return res;
      }
      fiber = fiber.return;
      depth++;
    }

    return null;
  };

  // Helper to detect current story index from progress bars
  const getActiveStoryIndexFromDOM = () => {
    const bars = Array.from(document.querySelectorAll('div[style*="transform"], div[style*="scaleX"]'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < 120 && rect.height <= 8 && rect.width > 2;
      });

    if (bars.length > 0) {
      let activeIdx = 0;
      for (let i = 0; i < bars.length; i++) {
        const transform = bars[i].style.transform || '';
        const match = transform.match(/scaleX\(([\d.]+)\)/);
        if (match) {
          const scale = parseFloat(match[1]);
          if (scale > 0 && scale < 0.99) {
            return i;
          }
          if (scale >= 0.99) {
            activeIdx = i + 1;
          }
        }
      }
      return Math.min(activeIdx, bars.length - 1);
    }
    return 0;
  };

  // Verify that a reel matches target user or target highlight
  const isMatchingReel = (reel, targetUsername, targetHighlightId, isHighlight, currentStoryId) => {
    if (!reel || !Array.isArray(reel.items) || reel.items.length === 0) return false;

    // 1. If we have currentStoryId, check if any item in reel matches this story ID
    if (currentStoryId) {
      const targetIdStr = currentStoryId.toString();
      const match = reel.items.some(item => {
        const id = (item.pk || item.id || '').toString();
        return id === targetIdStr || id.includes(targetIdStr);
      });
      if (match) return true;
    }

    // 2. If it's a highlight
    if (isHighlight && targetHighlightId) {
      const cleanHId = targetHighlightId.toString().replace(/^highlight:/, '');
      const reelId = (reel.id || '').toString().replace(/^highlight:/, '');
      if (reelId === cleanHId || reelId.includes(cleanHId)) return true;
    }

    // 3. Match by username
    if (targetUsername) {
      const cleanTarget = targetUsername.toLowerCase().trim();
      const reelUser = (reel.user?.username || reel.owner?.username || '').toLowerCase().trim();
      if (reelUser && reelUser === cleanTarget) return true;

      // Check if items have matching username
      const itemUserMatch = reel.items.some(item => {
        const u = (item.user?.username || item.owner?.username || '').toLowerCase().trim();
        return u === cleanTarget;
      });
      if (itemUserMatch) return true;
    }

    return false;
  };

  // Search the React Fiber tree for ONLY the matching story reel
  const findReelInDOMFiber = (targetUsername, targetHighlightId, isHighlight, currentStoryId) => {
    const header = document.querySelector('header');
    const roots = [header, ...Array.from(document.querySelectorAll('section, div[role="dialog"]'))].filter(Boolean);

    for (const root of roots) {
      let fiber = getReactFiber(root);
      let depth = 0;
      while (fiber && depth < 35) {
        for (const source of [fiber.memoizedProps, fiber.memoizedState]) {
          if (!source || typeof source !== 'object') continue;

          // Check reel properties
          for (const key of ['reel', 'currentReel', 'activeReel', 'storyReel']) {
            const reel = source[key];
            if (isMatchingReel(reel, targetUsername, targetHighlightId, isHighlight, currentStoryId)) {
              const list = [];
              const reelUser = reel.user?.username || reel.owner?.username || targetUsername || '';
              for (const item of reel.items) {
                const entry = processStoryItem(item, isHighlight ? targetHighlightId : null, reelUser);
                if (entry) list.push(entry);
              }
              if (list.length > 0) {
                list.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
                return list;
              }
            }
          }

          // Check array properties
          for (const key of ['reels_media', 'reelsMedia', 'reels', 'tray']) {
            const arr = Array.isArray(source[key]) ? source[key] : (source[key] && typeof source[key] === 'object' ? Object.values(source[key]) : null);
            if (Array.isArray(arr)) {
              for (const reel of arr) {
                if (isMatchingReel(reel, targetUsername, targetHighlightId, isHighlight, currentStoryId)) {
                  const list = [];
                  const reelUser = reel.user?.username || reel.owner?.username || targetUsername || '';
                  for (const item of reel.items) {
                    const entry = processStoryItem(item, isHighlight ? targetHighlightId : null, reelUser);
                    if (entry) list.push(entry);
                  }
                  if (list.length > 0) {
                    list.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
                    return list;
                  }
                }
              }
            }
          }
        }
        fiber = fiber.return;
        depth++;
      }
    }
    return null;
  };

  // Find active media element strictly inside the story viewer section
  const findActiveMediaFromViewer = () => {
    const storySection = document.querySelector('section');
    const root = storySection || document;
    const centerX = window.innerWidth / 2;

    const mediaEls = Array.from(root.querySelectorAll('video, img'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 120 && rect.height > 120 && !el.src?.includes('profile_pic') && !el.src?.includes('s150x150');
      });

    mediaEls.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const distA = Math.abs(rectA.left + rectA.width / 2 - centerX);
      const distB = Math.abs(rectB.left + rectB.width / 2 - centerX);
      return distA - distB;
    });

    for (const el of mediaEls) {
      // 1. Try React Fiber on the media element and parents
      const fiberMedia = findMediaInFiberTree(el);
      if (fiberMedia && fiberMedia.url) return fiberMedia;

      let parent = el.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const pMedia = findMediaInFiberTree(parent);
        if (pMedia && pMedia.url) return pMedia;
        parent = parent.parentElement;
      }

      // 2. Direct DOM video fallback
      if (el.tagName === 'VIDEO') {
        let url = el.currentSrc || el.src;
        const source = el.querySelector('source');
        if (source && source.src && !source.src.startsWith('blob:')) {
          url = source.src;
        }
        if (url && !url.startsWith('blob:')) {
          return {
            url: url,
            isVideo: true,
            resolvedId: Date.now().toString()
          };
        }
      }

      // 3. Direct DOM image fallback
      if (el.tagName === 'IMG') {
        let url = el.currentSrc || el.src;
        if (el.hasAttribute('srcset')) {
          const best = parseBestFromSrcset(el.getAttribute('srcset'));
          if (best) url = best;
        }
        if (url && !url.startsWith('blob:')) {
          return {
            url: url,
            isVideo: false,
            resolvedId: Date.now().toString()
          };
        }
      }
    }

    return null;
  };

  // Helper to extract user ID from story header React fiber
  const getUserIdFromHeaderFiber = (username) => {
    if (!username) return null;
    const cleanUser = username.toLowerCase();
    const header = document.querySelector('header');
    const links = Array.from(document.querySelectorAll(`header a[href*="${cleanUser}"], a[href*="/${cleanUser}/"], header a`));
    const elementsToSearch = [header, ...links].filter(Boolean);

    for (const el of elementsToSearch) {
      let fiber = getReactFiber(el);
      let depth = 0;
      while (fiber && depth < 30) {
        for (const source of [fiber.memoizedProps, fiber.memoizedState]) {
          if (!source || typeof source !== 'object') continue;
          if (source.user?.id || source.user?.pk) {
            if (!source.user.username || source.user.username.toLowerCase() === cleanUser) {
              return (source.user.id || source.user.pk).toString();
            }
          }
          if (source.reel?.user?.id || source.reel?.user?.pk) {
            if (!source.reel.user.username || source.reel.user.username.toLowerCase() === cleanUser) {
              return (source.reel.user.id || source.reel.user.pk).toString();
            }
          }
          if (source.reel?.id && !source.reel.id.startsWith('highlight:')) {
            const rUser = (source.reel.user?.username || source.reel.owner?.username || '').toLowerCase();
            if (rUser === cleanUser) {
              return source.reel.id.toString();
            }
          }
          if (source.profile?.id) {
            return source.profile.id.toString();
          }
        }
        fiber = fiber.return;
        depth++;
      }
    }
    return null;
  };

  // Fetch story array from API strictly using reels_media
  const fetchReelsFromAPI = async (username, storyOrHighlightId, isHighlight) => {
    try {
      let objectKey = '';
      let reelsUrl = '';

      if (isHighlight) {
        const cleanId = (storyOrHighlightId || '').replace(/^highlight:/, '');
        reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight:${cleanId}`;
        objectKey = `highlight:${cleanId}`;
      } else {
        let userId = null;

        // 1. Try React Fiber on the story header
        userId = getUserIdFromHeaderFiber(username);

        // 2. Try topsearch API to resolve username -> userId
        if (!userId && username) {
          try {
            const searchRes = await originalFetch(`https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(username)}`, {
              headers: getHeaders(),
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
        }

        // 3. Try web_profile_info
        if (!userId && username) {
          try {
            const profileRes = await originalFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
              headers: getHeaders(),
              credentials: 'include'
            });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              userId = profileData?.data?.user?.id?.toString();
            }
          } catch (e) {}
        }

        // 4. Strict script search (matching username explicitly)
        if (!userId && username) {
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

        if (!userId) {
          console.warn("Insta Downloader: Could not resolve user ID for", username);
          return null;
        }

        reelsUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
        objectKey = userId.toString();
      }

      const res = await originalFetch(reelsUrl, {
        headers: getHeaders(),
        credentials: 'include'
      });
      if (!res.ok) return null;

      const data = await res.json();
      processStoryReelResponse(data);

      // Check if processed into cache
      if (!isHighlight && username && mediaMapByUser.has(username.toLowerCase())) {
        const cached = Array.from(mediaMapByUser.get(username.toLowerCase()).values());
        if (cached.length > 0) {
          cached.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
          return cached;
        }
      }

      if (isHighlight && storyOrHighlightId) {
        const cleanHId = storyOrHighlightId.replace(/^highlight:/, '');
        if (mediaMapByHighlight.has(cleanHId)) {
          const cached = Array.from(mediaMapByHighlight.get(cleanHId).values());
          if (cached.length > 0) {
            cached.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
            return cached;
          }
        }
      }

      // Fallback direct extraction from response
      const reelObj = data?.reels?.[objectKey] || data?.reels?.[Object.keys(data?.reels || {})[0]] || data?.reels_media?.[0];
      if (reelObj && Array.isArray(reelObj.items)) {
        const list = [];
        const reelUser = reelObj.user?.username || username || '';
        for (const item of reelObj.items) {
          const entry = processStoryItem(item, isHighlight ? storyOrHighlightId : null, reelUser);
          if (entry) list.push(entry);
        }
        if (list.length > 0) {
          list.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
          return list;
        }
      }
    } catch (e) {
      console.warn("Insta Downloader: API fetch error:", e);
    }
    return null;
  };

  // --- MESSAGE HANDLER FROM CONTENT SCRIPT ---
  window.addEventListener('message', async (event) => {
    if (event.data?.source !== '__IG_SAVER_CONTENT__') return;

    const { action, requestId, storyId, username, isHighlight, storyOrHighlightId, specificHighlightItemId, currentStoryId } = event.data;

    if (action === 'GET_ACTIVE_MEDIA') {
      let result = null;

      // 1. Try cache by story ID
      if (storyId && mediaMapById.has(storyId.toString())) {
        result = mediaMapById.get(storyId.toString());
      }

      // 2. Try cache by specific highlight item ID
      if (!result && specificHighlightItemId && mediaMapById.has(specificHighlightItemId.toString())) {
        result = mediaMapById.get(specificHighlightItemId.toString());
      }

      // 3. Try matching user in story cache (using active progress bar index if storyId is omitted)
      if (!result && username && mediaMapByUser.has(username.toLowerCase())) {
        const userItems = Array.from(mediaMapByUser.get(username.toLowerCase()).values());
        userItems.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
        if (storyId) {
          result = userItems.find(x => x.id === storyId.toString() || x.id.includes(storyId.toString()));
        }
        if (!result && userItems.length > 0) {
          const activeIdx = getActiveStoryIndexFromDOM();
          result = userItems[activeIdx] || userItems[0];
        }
      }

      // 4. Try reading the active story directly from DOM viewer (React Fiber on active elements + DOM)
      if (!result) {
        result = findActiveMediaFromViewer();
      }

      // 5. Try extracting reel from story viewer DOM Fiber with strict match
      if (!result) {
        const domReel = findReelInDOMFiber(username, storyOrHighlightId, isHighlight, storyId || specificHighlightItemId);
        if (domReel && domReel.length > 0) {
          if (storyId || specificHighlightItemId) {
            const targetId = (specificHighlightItemId || storyId).toString();
            result = domReel.find(x => x.id === targetId || x.id.includes(targetId));
          }
          if (!result) {
            const activeIdx = getActiveStoryIndexFromDOM();
            result = domReel[activeIdx] || domReel[0];
          }
        }
      }

      // 6. Try highlight cache
      if (!result && isHighlight && storyOrHighlightId) {
        const cleanHId = storyOrHighlightId.replace(/^highlight:/, '');
        if (mediaMapByHighlight.has(cleanHId)) {
          const hItems = Array.from(mediaMapByHighlight.get(cleanHId).values());
          hItems.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
          if (specificHighlightItemId) {
            result = hItems.find(x => x.id === specificHighlightItemId.toString() || x.id.includes(specificHighlightItemId.toString()));
          }
          if (!result && hItems.length > 0) {
            const activeIdx = getActiveStoryIndexFromDOM();
            result = hItems[activeIdx] || hItems[0];
          }
        }
      }

      // 7. If still not found, fetch reel strictly from Instagram API
      if (!result && (username || storyOrHighlightId)) {
        const items = await fetchReelsFromAPI(username, storyOrHighlightId || storyId, isHighlight);
        if (items && items.length > 0) {
          if (storyId || specificHighlightItemId) {
            const targetId = (specificHighlightItemId || storyId).toString();
            result = items.find(x => x.id === targetId || x.id.includes(targetId)) || items[0];
          } else {
            const activeIdx = getActiveStoryIndexFromDOM();
            result = items[activeIdx] || items[0];
          }
        }
      }

      window.postMessage({
        source: '__IG_SAVER_MAIN__',
        requestId: requestId,
        action: 'ACTIVE_MEDIA_RESULT',
        data: result
      }, '*');
    }

    if (action === 'GET_ALL_MEDIA') {
      let items = null;

      // 1. Try cache by username
      if (!isHighlight && username && mediaMapByUser.has(username.toLowerCase())) {
        const cached = Array.from(mediaMapByUser.get(username.toLowerCase()).values());
        if (cached.length > 0) {
          cached.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
          items = cached;
        }
      }

      // 2. Try cache by highlight ID
      if (isHighlight && storyOrHighlightId) {
        const cleanHId = storyOrHighlightId.replace(/^highlight:/, '');
        if (mediaMapByHighlight.has(cleanHId)) {
          const cached = Array.from(mediaMapByHighlight.get(cleanHId).values());
          if (cached.length > 0) {
            cached.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
            items = cached;
          }
        }
      }

      // 3. Try reading reel directly from Story Viewer DOM React Fiber with strict user/story matching
      if (!items || items.length === 0) {
        const domReel = findReelInDOMFiber(username, storyOrHighlightId, isHighlight, currentStoryId);
        if (domReel && domReel.length > 0) {
          items = domReel;
        }
      }

      // 4. Fallback: fetch strictly from reel API
      if (!items || items.length === 0) {
        items = await fetchReelsFromAPI(username, storyOrHighlightId, isHighlight);
      }

      window.postMessage({
        source: '__IG_SAVER_MAIN__',
        requestId: requestId,
        action: 'ALL_MEDIA_RESULT',
        data: items
      }, '*');
    }
  });

  // Signal ready
  window.postMessage({ source: '__IG_SAVER_MAIN__', action: 'READY' }, '*');
})();
