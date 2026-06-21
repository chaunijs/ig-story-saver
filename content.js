// Scan for Instagram posts and inject a download button
const injectDownloadButtons = () => {
  // Instagram typically wraps posts in <article> tags
  const posts = document.querySelectorAll('article');
  
  posts.forEach(post => {
    // Prevent adding multiple buttons to the same post
    if (!post.querySelector('.custom-dl-btn')) {
      const btn = document.createElement('button');
      btn.innerText = 'Download';
      btn.className = 'custom-dl-btn';
      
      // Basic styling to match your neon aesthetic
      Object.assign(btn.style, {
        position: 'absolute',
        top: '15px',
        right: '15px',
        zIndex: '99',
        backgroundColor: '#1ed760',
        color: '#fff',
        border: 'none',
        padding: '8px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold'
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Basic logic to find the first image or video in the post
        const video = post.querySelector('video');
        const img = post.querySelector('img[style*="object-fit: cover"]');
        
        const mediaUrl = video ? video.src : (img ? img.src : null);

        if (mediaUrl) {
          // Send the URL to the background script to initiate download
          chrome.runtime.sendMessage({ action: 'download', url: mediaUrl });
        } else {
          alert('Could not locate media URL for this post.');
        }
      });

      post.style.position = 'relative';
      post.appendChild(btn);
    }
  });
};

// Because Instagram loads content dynamically as you scroll, 
// we run the injection function periodically.
setInterval(injectDownloadButtons, 2000);