// background.js
// Configuration
const BERTOPIC_API_URL = 'http://localhost:5001'; // Using port 5001 to avoid conflicts

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzePost') {
        const asyncResponse = sendResponse;

        analyzeRedditPostWithBERTopic(request.url, request.apiKey)
            .then(result => {
                asyncResponse({ success: true, data: result });
            })
            .catch(error => {
                console.error('Error in analyzePost:', error);
                asyncResponse({
                    success: false,
                    error: error.message || 'Failed to analyze post'
                });
            });

        return true; // Keep the message channel open for async response
    } else if (request.action === 'getPostInfo') {
        const asyncResponse = sendResponse;

        getPostInfo(request.url)
            .then(info => {
                asyncResponse({ success: true, ...info });
            })
            .catch(error => {
                console.error('Error getting post info:', error);
                asyncResponse({
                    success: false,
                    error: error.message || 'Failed to get post info'
                });
            });

        return true; // Keep the message channel open for async response
    }
    return false;
});

async function analyzeRedditPostWithBERTopic(redditUrl, apiKey) {
    sendStatusUpdate('Scraping Reddit post...', 10);

    try {
        const postData = await scrapeRedditPost(redditUrl);

        if (!postData || !postData.comments || postData.comments.length === 0) {
            throw new Error('No comments found to analyze');
        }

        if (postData.comments.length < 10) {
            sendNotification('warning', 'Fewer than 10 comments found. Analysis may be less accurate.');
        }

        sendStatusUpdate(`Analyzing ${postData.comments.length} comments...`, 20);

        const analysis = await callBERTopicAPI({
            url: redditUrl,
            title: postData.title,
            comments: postData.comments,
            openai_api_key: apiKey
        });

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
        let finalHandled = false; // Guard to avoid processing final result multiple times

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

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 2);

                    if (line) {
                        processChunk(line);
                    }
                }

                return reader.read().then(processText);
            }

            function processChunk(chunk) {
                try {
                    console.log('Processing chunk:', chunk);
                    let data;

                    try {
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

                    if (!data || typeof data !== 'object') {
                        throw new Error('Invalid data format: expected an object');
                    }

                    const status = String(data.status || '').toLowerCase();

                    if (status === 'progress') {
                        const message = String(data.message || 'Processing...');
                        const progress = typeof data.progress === 'number'
                            ? Math.max(0, Math.min(100, data.progress))
                            : 0;

                        console.log(`Progress update: ${message} (${progress}%)`);
                        sendStatusUpdate(message, progress);

                    } else if (status === 'success' || status === 'complete') {
                        if (finalHandled) {
                            console.warn('Final result already handled, ignoring duplicate final chunk.');
                            return;
                        }
                        finalHandled = true;

                        console.log('Final response received, raw data:', data);
                        // Log data.summary explicitly for debugging
                        console.log('Final data.summary:', data.summary);

                        console.log('Formatting result for UI...');
                        const result = formatAnalysisResult(data, postData);
                        console.log('Formatted result object:', result);

                        // Log formatted words for each topic
                        if (Array.isArray(result.topics)) {
                            console.log(`Formatted topics count: ${result.topics.length}`);
                            result.topics.forEach((t, idx) => {
                                console.log(`Topic \${idx}: id=\${t.id}, label="\${t.label}", words="\${t.words}", count=\${t.count}, percentage=\${t.percentage}`);
                            });
                        } else {
                            console.warn('Result.topics is not an array:', result.topics);
                        }

                        if (!result.topics || result.topics.length === 0) {
                            console.warn('No topics identified in the analysis result.');
                            sendNotification('info', 'No topics identified. Try analyzing a different post.');
                        }

                        resolve(result);

                    } else if (status === 'error') {
                        if (finalHandled) {
                            console.warn('Error final chunk received after finalHandled; ignoring.');
                            return;
                        }
                        finalHandled = true;

                        const errorMessage = String(data.error || 'Unknown server error');
                        console.error('Server error response:', errorMessage);
                        reject(new Error(errorMessage));

                    } else {
                        const errorMessage = `Unexpected response status: ${status}`;
                        console.warn(errorMessage);
                        if (!finalHandled) {
                            finalHandled = true;
                            reject(new Error(errorMessage));
                        }
                    }
                } catch (e) {
                    console.error('Error in processChunk:', e);
                    console.error('Original chunk that caused the error:', chunk);
                    const errorMessage = e instanceof Error ? e.message : 'Unknown error processing server response';
                    if (!finalHandled) {
                        finalHandled = true;
                        reject(new Error(`Failed to process server response: ${errorMessage}`));
                    }
                }
            }

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

function formatAnalysisResult(data, postData) {
    const topics = Array.isArray(data.topics) ? data.topics : [];

    if (topics.length === 0) {
        console.warn('No topics identified in the analysis result.');
    }

    const formatWords = (words) => {
        if (!words) return '';
        if (Array.isArray(words)) {
            const formatted = words.map(word => String(word || '').trim()).filter(Boolean).join(' | ');
            // Log each formatted words string for debug
            console.log('formatWords output for words array:', formatted);
            return formatted;
        }
        const single = String(words || '').trim();
        console.log('formatWords output for non-array words:', single);
        return single;
    };

    const formattedTopics = topics.map(topic => {
        const ft = {
            id: topic.id || 0,
            words: formatWords(topic.words),
            label: topic.label || `Topic ${(topic.id || 0) + 1}`,
            count: topic.count || 0,
            percentage: topic.percentage || 0
        };
        // Log formatted topic object
        console.log('Formatted topic:', ft);
        return ft;
    });

    // Log data.summary explicitly
    console.log('formatAnalysisResult - data.summary:', data.summary);

    return {
        summary: data.summary || 'No summary available',
        topics: formattedTopics,
        postInfo: {
            title: postData.title || 'Untitled Post',
            url: postData.url || '',
            commentCount: postData.comments?.length || 0,
            topicCount: topics.length
        },
        modelUsed: data.model_used || 'Unknown',
        openaiEnhanced: Boolean(data.openai_enhanced)
    };
}


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
// Helper function to send status updates
function sendStatusUpdate(message, progress, isComplete = false, isError = false) {
    try {
        chrome.runtime.sendMessage({
            action: 'updateStatus',
            status: String(message || ''),
            progress: typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0,
            isComplete: Boolean(isComplete),
            isError: Boolean(isError)
        }).catch(error => {
            console.warn('Failed to send status update:', error);
        });
    } catch (e) {
        console.error('Error in sendStatusUpdate:', e);
    }
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