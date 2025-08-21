document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apiKey');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const viewSummaryBtn = document.getElementById('viewSummaryBtn');
    const status = document.getElementById('status');
    const summaryContainer = document.getElementById('summaryContainer');
    const summaryText = document.getElementById('summaryText');
    const redditInfo = document.getElementById('redditInfo');
    const postTitle = document.getElementById('postTitle');
    
    // Load saved API key
    chrome.storage.sync.get(['openaiApiKey'], function(result) {
        if (result.openaiApiKey) {
            apiKeyInput.value = result.openaiApiKey;
        }
    });
    
    // Save API key when changed
    apiKeyInput.addEventListener('input', function() {
        chrome.storage.sync.set({
            openaiApiKey: apiKeyInput.value
        });
    });
    
    // Check if we're on a Reddit post page
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        const isRedditPost = currentTab.url && currentTab.url.match(/reddit\.com\/r\/.*\/comments\//);
        
        if (isRedditPost) {
            // Get post title from content script
            chrome.tabs.sendMessage(currentTab.id, {action: 'getPostInfo'}, function(response) {
                if (response && response.title) {
                    postTitle.textContent = `Post: ${response.title.substring(0, 50)}${response.title.length > 50 ? '...' : ''}`;
                } else {
                    postTitle.textContent = 'Reddit post detected';
                }
            });
            
            // Check if analysis already exists
            chrome.storage.local.get([`analysis_${currentTab.url}`], function(result) {
                const analysisKey = `analysis_${currentTab.url}`;
                if (result[analysisKey]) {
                    viewSummaryBtn.classList.remove('hidden');
                    showStatus('Analysis ready! Click "View Summary" to see results.', 'success');
                }
            });
        } else {
            postTitle.textContent = 'Navigate to a Reddit post to analyze';
            analyzeBtn.disabled = true;
        }
    });
    
    // Analyze button click
    analyzeBtn.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter your OpenAI API key', 'error');
            return;
        }
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            
            if (!currentTab.url.match(/reddit\.com\/r\/.*\/comments\//)) {
                showStatus('Please navigate to a Reddit post', 'error');
                return;
            }
            
            showStatus('Analyzing discussion... This may take 1-2 minutes', 'loading');
            analyzeBtn.disabled = true;
            
            // Send message to background script to start analysis
            chrome.runtime.sendMessage({
                action: 'analyzePost',
                url: currentTab.url,
                apiKey: apiKey
            }, function(response) {
                analyzeBtn.disabled = false;
                
                if (response.success) {
                    showStatus('Analysis complete!', 'success');
                    viewSummaryBtn.classList.remove('hidden');
                    
                    // Store the analysis
                    const analysisKey = `analysis_${currentTab.url}`;
                    chrome.storage.local.set({
                        [analysisKey]: response.data
                    });
                } else {
                    showStatus(`Error: ${response.error}`, 'error');
                }
            });
        });
    });
    
    // View summary button click
    viewSummaryBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            const analysisKey = `analysis_${currentTab.url}`;
            
            chrome.storage.local.get([analysisKey], function(result) {
                if (result[analysisKey]) {
                    displaySummary(result[analysisKey]);
                } else {
                    showStatus('No analysis found. Please run analysis first.', 'error');
                }
            });
        });
    });
    
    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
        status.classList.remove('hidden');
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                status.classList.add('hidden');
            }, 5000);
        }
    }
    
    function displaySummary(analysisData) {
        const { summary, topics, postInfo } = analysisData;
        
        let summaryHtml = '';
        
        if (postInfo) {
            summaryHtml += `<div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.2);">
                <strong>📝 Post:</strong> ${postInfo.title}<br>
                <strong>💬 Comments Analyzed:</strong> ${postInfo.commentCount}
            </div>`;
        }
        
        if (summary) {
            summaryHtml += `<div style="margin-bottom: 15px;">
                <strong>🧠 AI Summary:</strong><br>
                <div style="margin-top: 8px; font-style: italic;">${summary}</div>
            </div>`;
        }
        
        if (topics && topics.length > 0) {
            summaryHtml += `<div>
                <strong>📊 Key Topics:</strong><br>
                <div style="margin-top: 8px;">`;
            
            topics.forEach((topic, index) => {
                summaryHtml += `<div style="margin: 5px 0; padding: 5px 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px;">
                    <strong>Topic ${topic.id}:</strong> ${topic.words} (${topic.count} comments)
                </div>`;
            });
            
            summaryHtml += `</div></div>`;
        }
        
        summaryText.innerHTML = summaryHtml;
        summaryContainer.classList.remove('hidden');
        
        // Scroll to summary
        summaryContainer.scrollIntoView({ behavior: 'smooth' });
    }
});