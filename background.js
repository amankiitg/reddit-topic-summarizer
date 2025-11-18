// Configuration
const BERTOPIC_API_URL = 'http://localhost:5001';  // Using port 5001 to avoid conflicts

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzePost') {
        analyzeRedditPostWithBERTopic(request.url, request.apiKey)
            .then(result => sendResponse(result))
            .catch(error => {
                console.error('Error in analyzePost:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for async response
    } else if (request.action === 'getPostInfo') {
        getPostInfo(request.url)
            .then(info => sendResponse(info))
            .catch(error => {
                console.error('Error getting post info:', error);
                sendResponse({ error: error.message });
            });
        return true; // Keep the message channel open for async response
    }
});

async function getPostInfo(redditUrl) {
    try {
        const postData = await scrapeRedditPost(redditUrl);
        return {
            success: true,
            title: postData.title,
            commentCount: postData.comments.length
        };
    } catch (error) {
        console.error('Error getting post info:', error);
        return { success: false, title: null, commentCount: 0 };
    }
}

async function analyzeRedditPostWithBERTopic(redditUrl, apiKey) {
    // Send initial status update
    sendStatusUpdate('Scraping Reddit post...', 10);

    try {
        // Scrape the post and comments
        const postData = await scrapeRedditPost(redditUrl);

        if (!postData || !postData.comments || postData.comments.length === 0) {
            throw new Error('No comments found to analyze');
        }

        // Show warning if fewer than 10 comments
        if (postData.comments.length < 10) {
            sendNotification('warning', 'Fewer than 10 comments found. Analysis may be less accurate.');
        }

        // Update status before API call
        sendStatusUpdate(`Analyzing ${postData.comments.length} comments...`, 20);

        // Call the BERTopic API with progress tracking
        const analysis = await callBERTopicAPI({
            url: redditUrl,
            title: postData.title,
            comments: postData.comments,
            openai_api_key: apiKey
        });

        // Send completion message
        sendStatusUpdate('Analysis complete!', 100, true);

        return {
            success: true,
            data: analysis,
            postTitle: postData.title,
            postUrl: redditUrl
        };
    } catch (error) {
        console.error('Error in analyzeRedditPostWithBERTopic:', error);
        sendStatusUpdate('Error: ' + (error.message || 'Failed to analyze post'), 100, true, true);
        throw error;
    }
}

async function callBERTopicAPI(postData) {
    return new Promise((resolve, reject) => {
        console.log('Sending request to BERTopic API...');

        fetch(`${BERTOPIC_API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comments: postData.comments.map(c => c.body),
                openai_api_key: postData.openai_api_key,
                post_title: postData.title
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    console.error('API Error Response:', text);
                    throw new Error(`HTTP error! status: ${response.status}, response: ${text}`);
                });
            }

            // Handle the streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function processText({ done, value }) {
                if (done) {
                    if (buffer.trim()) {
                        processChunk(buffer);
                    }
                    return;
                }

                // Decode the chunk of data
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Process complete JSON objects from the buffer
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 2);

                    if (line) {
                        processChunk(line);
                    }
                }

                // Continue reading
                return reader.read().then(processText);
            }

            function processChunk(chunk) {
            try {
                console.log('Processing chunk:', chunk);
                let data;

                try {
                    // First, ensure the chunk is a string
                    const chunkString = String(chunk || '').trim();
                    if (!chunkString) {
                        throw new Error('Empty chunk received');
                    }

                    data = JSON.parse(chunkString);
                } catch (parseError) {
                    console.error('Failed to parse JSON:', parseError);
                    console.error('Problematic chunk content:', chunk);
                    throw new Error(`Invalid JSON received: ${parseError.message}`);
                }

                console.log('Parsed data:', data);

                // Validate the basic structure
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid data format: expected an object');
                }

                // Ensure status is a string
                const status = String(data.status || '').toLowerCase();

                if (status === 'progress') {
                    // Handle progress updates
                    const message = String(data.message || 'Processing...');
                    const progress = typeof data.progress === 'number'
                        ? Math.max(0, Math.min(100, data.progress))
                        : 0;

                    console.log(`Progress update: ${message} (${progress}%)`);
                    sendStatusUpdate(message, progress);

                } else if (status === 'success') {
                    // Final result
                    console.log('Success response received, formatting result...');
                    try {
                        if (!data.data || typeof data.data !== 'object') {
                            throw new Error('Invalid data format in success response');
                        }

                        const result = formatAnalysisResult(data.data, postData);
                        console.log('Formatted result:', result);
                        resolve(result);
                    } catch (formatError) {
                        console.error('Error formatting analysis result:', formatError);
                        console.error('Problematic data:', data.data);
                        throw new Error(`Failed to format analysis result: ${formatError.message}`);
                    }

                } else if (status === 'error') {
                    // Error from server
                    const errorMessage = String(data.error || 'Unknown server error');
                    console.error('Server error response:', errorMessage);
                    reject(new Error(errorMessage));

                } else {
                    const errorMessage = `Unexpected response status: ${status}`;
                    console.warn(errorMessage);
                    reject(new Error(errorMessage));
                }
            } catch (e) {
                console.error('Error in processChunk:', e);
                console.error('Original chunk that caused the error:', chunk);
                const errorMessage = e instanceof Error ? e.message : 'Unknown error processing server response';
                reject(new Error(`Failed to process server response: ${errorMessage}`));
            }
        }

            // Start reading the stream
            return reader.read().then(processText);
        })
        .catch(error => {
            console.error('Error in callBERTopicAPI:', error);
            if (error.message.includes('Failed to fetch')) {
                reject(new Error('Could not connect to the analysis server. Please make sure the server is running.'));
            } else {
                reject(new Error(`Failed to analyze post: ${error.message}`));
            }
        });
    });
}

// Helper function to format the analysis result
function formatAnalysisResult(data, postData) {
    // Ensure topics is an array
    const topics = Array.isArray(data.topics) ? data.topics : [];

    // Helper function to safely format words
    const formatWords = (words) => {
        if (!words) return '';
        if (Array.isArray(words)) {
            return words.map(word => {
                if (word === null || word === undefined) return '';
                return String(word);
            }).filter(word => word.trim() !== '').join(' | ');
        }
        return String(words || '');
    };

    return {
        summary: data.summary || 'No summary available',
        topics: topics.map(topic => ({
            id: typeof topic.id === 'number' ? topic.id : 0,
            words: formatWords(topic.words),
            label: topic.label || `Topic ${(topic.id || 0) + 1}`,
            count: typeof topic.count === 'number' ? topic.count : 0,
            percentage: typeof topic.percentage === 'number' ? topic.percentage : 0
        })),
        postInfo: {
            title: postData.title || 'Untitled Post',
            url: postData.url || '',
            commentCount: Array.isArray(postData.comments) ? postData.comments.length : 0,
            topicCount: topics.length
        },
        modelUsed: data.model_used || 'Unknown',
        openaiEnhanced: Boolean(data.openai_enhanced)
    };
}

// Helper function to send status updates
function sendStatusUpdate(message, progress, isComplete = false, isError = false) {
    chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: String(message || ''),
        progress: typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0,
        isComplete: Boolean(isComplete),
        isError: Boolean(isError)
    }).catch(error => {
        console.warn('Failed to send status update:', error);
    });
}

// Helper function to send notifications
function sendNotification(type, message) {
    chrome.runtime.sendMessage({
        action: 'showNotification',
        type: String(type || 'info'),
        message: String(message || '')
    }).catch(error => {
        console.warn('Failed to send notification:', error);
    });
}

// Scrape Reddit post and comments
async function scrapeRedditPost(redditUrl) {
    try {
        const jsonUrl = redditUrl.replace(/\/$/, '') + '.json?limit=500';

        const response = await fetch(jsonUrl, {
            headers: {
                'User-Agent': 'Reddit Topic Summarizer Chrome Extension 1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Reddit data: ${response.status}`);
        }

        const data = await response.json();

        // Extract post information
        const post = data[0]?.data?.children?.[0]?.data;
        const commentsData = data[1]?.data?.children || [];

        if (!post) {
            throw new Error('Could not find post data');
        }

        // Extract and clean comments
        const comments = extractComments(commentsData);

        // Filter comments
        const filteredComments = comments
            .filter(comment =>
                comment.body &&
                comment.body.length > 10 && // Minimum length
                !comment.body.startsWith('>') && // Skip quoted text
                !comment.body.includes('I am a bot') &&
                !comment.body.toLowerCase().includes('removed') &&
                !comment.body.toLowerCase().includes('deleted')
            )
            .map(comment => ({
                id: comment.id || '',
                author: comment.author || 'unknown',
                body: cleanText(comment.body || ''),
                score: typeof comment.score === 'number' ? comment.score : 0,
                created_utc: comment.created_utc || 0
            }));

        return {
            title: post.title || 'Untitled Post',
            url: redditUrl,
            author: post.author || 'unknown',
            score: typeof post.score === 'number' ? post.score : 0,
            created_utc: post.created_utc || 0,
            num_comments: typeof post.num_comments === 'number' ? post.num_comments : 0,
            comments: filteredComments
        };
    } catch (error) {
        console.error('Error in scrapeRedditPost:', error);
        throw new Error(`Failed to scrape Reddit post: ${error.message}`);
    }
}

// Extract comments from Reddit API response
function extractComments(commentsData, allComments = []) {
    if (!commentsData || !Array.isArray(commentsData)) {
        return allComments;
    }

    for (const item of commentsData) {
        if (item?.kind === 't1' && item?.data) { // t1 is the kind for comments
            const comment = item.data;
            allComments.push({
                id: comment.id || '',
                author: comment.author || 'unknown',
                body: comment.body || '',
                score: typeof comment.score === 'number' ? comment.score : 0,
                created_utc: comment.created_utc || 0,
                depth: typeof comment.depth === 'number' ? comment.depth : 0
            });

            // Recursively process replies
            if (comment.replies?.data?.children) {
                extractComments(comment.replies.data.children, allComments);
            }
        }
    }

    return allComments;
}

// Clean and normalize text
function cleanText(text) {
    if (!text) return '';

    // Convert to string in case it's not
    let cleaned = String(text);

    // Remove markdown links, code blocks, and other formatting
    cleaned = cleaned
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // Remove code blocks
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // Remove bold/italic
        .replace(/~~([^~]+)~~/g, '$1') // Remove strikethrough
        .replace(/^>.*$/gm, '') // Remove blockquotes
        .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
        .trim();

    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');

    // Remove special characters but keep basic punctuation
    cleaned = cleaned.replace(/[^\w\s.,!?'"-]/g, ' ');

    // Normalize whitespace
    return cleaned.replace(/\s+/g, ' ').trim();
}