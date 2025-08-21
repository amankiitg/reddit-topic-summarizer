// Background service worker for Reddit Topic Summarizer

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzePost') {
        analyzeRedditPost(request.url, request.apiKey)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
});

async function analyzeRedditPost(redditUrl, apiKey) {
    try {
        // Step 1: Extract post data from Reddit
        const postData = await scrapeRedditPost(redditUrl);
        
        // Step 2: Perform simplified topic modeling
        const topics = await performTopicModeling(postData.comments);
        
        // Step 3: Generate OpenAI summary
        const summary = await generateOpenAISummary(topics, apiKey);
        
        return {
            success: true,
            data: {
                summary: summary,
                topics: topics.slice(0, 5), // Top 5 topics
                postInfo: {
                    title: postData.title,
                    commentCount: postData.comments.length
                }
            }
        };
    } catch (error) {
        console.error('Analysis error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function scrapeRedditPost(redditUrl) {
    try {
        // Convert Reddit URL to JSON API URL
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
        const post = data[0].data.children[0].data;
        const commentsData = data[1].data.children;
        
        // Extract and clean comments
        const comments = extractComments(commentsData);
        
        // Filter comments (minimum length, remove deleted)
        const filteredComments = comments
            .filter(comment => 
                comment.body && 
                comment.body.length > 20 && 
                comment.body !== '[deleted]' && 
                comment.body !== '[removed]'
            )
            .map(comment => ({
                text: cleanText(comment.body),
                score: comment.score || 0
            }))
            .filter(comment => comment.text.length > 20);
        
        // Apply score filtering (keep comments above median score)
        const scores = filteredComments.map(c => c.score);
        const medianScore = scores.length > 0 ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0;
        const finalComments = filteredComments.filter(c => c.score >= medianScore);
        
        return {
            title: post.title,
            comments: finalComments.slice(0, 200) // Limit to 200 comments for performance
        };
    } catch (error) {
        throw new Error(`Failed to scrape Reddit post: ${error.message}`);
    }
}

function extractComments(commentsData) {
    const comments = [];
    
    function processComment(commentData) {
        if (commentData.kind === 't1' && commentData.data) {
            const data = commentData.data;
            if (data.body) {
                comments.push({
                    body: data.body,
                    score: data.score
                });
            }
            
            // Process replies recursively
            if (data.replies && data.replies.data && data.replies.data.children) {
                data.replies.data.children.forEach(processComment);
            }
        }
    }
    
    commentsData.forEach(processComment);
    return comments;
}

function cleanText(text) {
    if (!text) return '';
    
    // Remove URLs
    text = text.replace(/https?:\/\/[^\s]+/g, '');
    
    // Remove Reddit markdown
    text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
    text = text.replace(/\*(.*?)\*/g, '$1'); // Italic
    text = text.replace(/~~(.*?)~~/g, '$1'); // Strikethrough
    text = text.replace(/\^(\w+)/g, '$1'); // Superscript
    
    // Remove excessive whitespace and newlines
    text = text.replace(/\n+/g, ' ');
    text = text.replace(/\s+/g, ' ');
    
    return text.trim().toLowerCase();
}

async function performTopicModeling(comments) {
    // Simplified topic modeling using keyword frequency analysis
    const texts = comments.map(c => c.text);
    
    // Extract keywords and their frequencies
    const wordFreq = {};
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this', 'it', 'from', 'they', 'we', 'say', 'her', 'she', 'he', 'has', 'had', 'his', 'him', 'you', 'your', 'my', 'me', 'i', 'am', 'are', 'was', 'were', 'been', 'be', 'have', 'do', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cant', 'dont', 'wont', 'wouldnt', 'couldnt', 'shouldnt', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'doesnt', 'didnt', 'a', 'an', 'so', 'if', 'then', 'than', 'when', 'where', 'why', 'how', 'what', 'who', 'whom', 'whose', 'while', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now']);
    
    texts.forEach(text => {
        const words = text.split(/\s+/)
            .map(word => word.replace(/[^\w]/g, ''))
            .filter(word => word.length > 2 && !stopWords.has(word));
        
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
    });
    
    // Get top words
    const sortedWords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 50);
    
    // Group words into topics using co-occurrence
    const topics = await groupWordsIntoTopics(sortedWords, texts);
    
    return topics;
}

async function groupWordsIntoTopics(sortedWords, texts) {
    // Simple co-occurrence based topic grouping
    const topics = [];
    const usedWords = new Set();
    
    for (let i = 0; i < Math.min(5, sortedWords.length); i++) {
        if (usedWords.has(sortedWords[i][0])) continue;
        
        const seedWord = sortedWords[i][0];
        const relatedWords = [seedWord];
        usedWords.add(seedWord);
        
        // Find related words that often appear together
        for (let j = i + 1; j < Math.min(20, sortedWords.length); j++) {
            const candidateWord = sortedWords[j][0];
            if (usedWords.has(candidateWord)) continue;
            
            const cooccurrence = countCooccurrence(seedWord, candidateWord, texts);
            if (cooccurrence > 2) {
                relatedWords.push(candidateWord);
                usedWords.add(candidateWord);
                if (relatedWords.length >= 5) break;
            }
        }
        
        // Count documents containing these words
        const docCount = texts.filter(text => 
            relatedWords.some(word => text.includes(word))
        ).length;
        
        topics.push({
            id: i,
            words: relatedWords.join(' | '),
            count: docCount,
            keywords: relatedWords
        });
    }
    
    return topics;
}

function countCooccurrence(word1, word2, texts) {
    return texts.filter(text => 
        text.includes(word1) && text.includes(word2)
    ).length;
}

async function generateOpenAISummary(topics, apiKey) {
    try {
        const topicsText = topics
            .map(topic => `Topic ${topic.id} (${topic.count} comments): ${topic.words}`)
            .join('\n');
        
        const prompt = `You are a summarization assistant. Analyze the following topics from a Reddit discussion and provide a concise 2-3 sentence summary of the main themes and discussions:

${topicsText}

Provide a clear, engaging summary that captures the essence of what people are discussing.`;
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that summarizes online discussions.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 200,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content.trim();
        
    } catch (error) {
        console.warn('OpenAI summary failed:', error);
        return `Discussion covers ${topics.length} main topics: ${topics.map(t => t.keywords[0]).join(', ')}. Analysis based on ${topics.reduce((sum, t) => sum + t.count, 0)} comments.`;
    }
}