// Content script for Reddit pages
(function() {
    'use strict';
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getPostInfo') {
            const postInfo = getRedditPostInfo();
            sendResponse(postInfo);
        }
    });
    
    function getRedditPostInfo() {
        try {
            // Try multiple selectors for post title
            let title = '';
            
            const titleSelectors = [
                '[data-test-id="post-content"] h1',
                '[data-adclicklocation="title"] h1',
                'h1[tabindex="-1"]',
                '[slot="title"]',
                '.Post h3',
                'h3._eYtD2XCVieq6emjKBH3m'
            ];
            
            for (const selector of titleSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    title = element.textContent.trim();
                    break;
                }
            }
            
            // Fallback: try to get title from page title
            if (!title) {
                const pageTitle = document.title;
                if (pageTitle.includes(' : ')) {
                    title = pageTitle.split(' : ')[0];
                }
            }
            
            // Get comment count
            let commentCount = 0;
            const commentCountSelectors = [
                '[data-test-id="comment-count"]',
                'span:contains("comment")',
                '.comments span'
            ];
            
            for (const selector of commentCountSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const text = element.textContent;
                    const match = text.match(/(\d+)/);
                    if (match) {
                        commentCount = parseInt(match[1]);
                        break;
                    }
                }
            }
            
            return {
                title: title || 'Reddit Post',
                url: window.location.href,
                commentCount: commentCount
            };
        } catch (error) {
            console.error('Error getting Reddit post info:', error);
            return {
                title: 'Reddit Post',
                url: window.location.href,
                commentCount: 0
            };
        }
    }
    
    // Add visual indicator when extension is active
    function addExtensionIndicator() {
        if (document.getElementById('reddit-summarizer-indicator')) return;
        
        const indicator = document.createElement('div');
        indicator.id = 'reddit-summarizer-indicator';
        indicator.innerHTML = '🧠 Topic Summarizer Active';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        
        document.body.appendChild(indicator);
        
        // Fade in
        setTimeout(() => {
            indicator.style.opacity = '0.9';
        }, 100);
        
        // Fade out after 3 seconds
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 3000);
    }
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addExtensionIndicator);
    } else {
        addExtensionIndicator();
    }
    
})();