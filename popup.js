document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const apiKeyInput = document.getElementById('apiKey');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const statusDiv = document.getElementById('status');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultsDiv = document.getElementById('results');
    const notificationsDiv = document.getElementById('notifications');
    const postTitle = document.getElementById('postTitle');

    let isAnalyzing = false;

    // Initialize the popup
    function initPopup() {
        // Load saved API key if exists
        chrome.storage.sync.get(['openaiApiKey'], function(result) {
            if (result.openaiApiKey) {
                apiKeyInput.value = result.openaiApiKey;
            }
        });

        // Check current tab when popup opens
        updateCurrentTabInfo();
    }

    // Update UI with current tab information
    function updateCurrentTabInfo() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url && currentTab.url.includes('reddit.com')) {
                // Request post info from background script
                chrome.runtime.sendMessage({
                    action: 'getPostInfo',
                    url: currentTab.url
                }, response => {
                    if (response && response.success) {
                        postTitle.textContent = response.title || 'Reddit Post';
                        if (response.commentCount > 0) {
                            postTitle.textContent += ` (${response.commentCount} comments)`;
                        }
                    }
                });
            } else {
                postTitle.textContent = 'Navigate to a Reddit post to analyze';
            }
        });
    }

    // Show notification
    function showNotification(type, message) {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show`;
        notification.role = 'alert';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        notificationsDiv.prepend(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // Update status and progress
    function updateStatus(message, progress = 0, isComplete = false, isError = false) {
        if (progressText) progressText.textContent = message;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            progressBar.classList.remove('bg-success', 'bg-danger');

            if (isComplete) {
                if (isError) {
                    progressBar.classList.add('bg-danger');
                    showNotification('danger', message);
                } else {
                    progressBar.classList.add('bg-success');
                    showNotification('success', message);
                }
            }
        }

        analyzeBtn.disabled = isAnalyzing;
    }

    // Display analysis results
    function displayResults(data) {
        resultsDiv.innerHTML = ''; // Clear previous results

        if (!data) {
            resultsDiv.innerHTML = '<div class="alert alert-warning">No results to display</div>';
            return;
        }

        let html = `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">${data.postInfo?.title || 'Analysis Results'}</h5>
                </div>
                <div class="card-body">
                    <p class="card-text">${data.summary || 'No summary available.'}</p>

                    <h6 class="mt-4">Key Topics:</h6>
                    <div class="list-group mb-3">
        `;

        if (data.topics && data.topics.length > 0) {
            data.topics.forEach(topic => {
                html += `
                    <div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${topic.label || `Topic ${topic.id + 1}`}</h6>
                            <small>${topic.count} comments (${topic.percentage}%)</small>
                        </div>
                        <p class="mb-1">${topic.words}</p>
                    </div>
                `;
            });
        } else {
            html += '<div class="alert alert-info">No topics identified</div>';
        }

        html += `
                    </div>
                    <div class="text-muted small">
                        <span class="badge bg-secondary">${data.modelUsed || 'Model: N/A'}</span>
                        ${data.openaiEnhanced ? '<span class="badge bg-success ms-1">OpenAI Enhanced</span>' : ''}
                    </div>
                </div>
            </div>
        `;

        resultsDiv.innerHTML = html;
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }

    // Handle analyze button click
    analyzeBtn.addEventListener('click', function() {
        if (isAnalyzing) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showNotification('warning', 'Please enter your OpenAI API key');
            return;
        }

        // Save API key
        chrome.storage.sync.set({ openaiApiKey: apiKey }, function() {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];

                if (!currentTab.url.match(/reddit\.com\/r\/.*\/comments\//)) {
                    showNotification('danger', 'Please navigate to a Reddit post first');
                    return;
                }

                isAnalyzing = true;
                updateStatus('Starting analysis...', 5);
                resultsDiv.innerHTML = ''; // Clear previous results

                // Send message to background script
                chrome.runtime.sendMessage({
                    action: 'analyzePost',
                    url: currentTab.url,
                    apiKey: apiKey
                }, function(response) {
                    isAnalyzing = false;

                    if (chrome.runtime.lastError) {
                        updateStatus('Error: ' + chrome.runtime.lastError.message, 0, true, true);
                        return;
                    }

                    if (response && response.success) {
                        displayResults(response.data);
                        updateStatus('Analysis complete!', 100, true);
                    } else {
                        const errorMsg = response?.error || 'Unknown error occurred';
                        updateStatus('Error: ' + errorMsg, 0, true, true);
                    }
                });
            });
        });
    });

    // Initialize tooltips
    function initTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateStatus') {
            updateStatus(
                message.status,
                message.progress,
                message.isComplete,
                message.isError
            );
        } else if (message.action === 'showNotification') {
            showNotification(message.type, message.message);
        } else if (message.action === 'updatePostInfo' && message.title) {
            postTitle.textContent = message.title;
        }

        return true; // Keep the message channel open for async response
    });

    // Initialize the popup
    initPopup();
    initTooltips();
});