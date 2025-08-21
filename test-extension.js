// Test script for Reddit Topic Summarizer Extension
// Run in browser console to test functionality

console.log('🧪 Reddit Topic Summarizer Test Script');
console.log('=====================================');

// Test 1: Check if we're on a Reddit post
function testRedditDetection() {
    const isReddit = window.location.hostname.includes('reddit.com');
    const isPost = window.location.pathname.includes('/comments/');
    
    console.log('📍 Reddit Detection Test:');
    console.log(`  - On Reddit: ${isReddit}`);
    console.log(`  - On Post Page: ${isPost}`);
    console.log(`  - Current URL: ${window.location.href}`);
    
    return isReddit && isPost;
}

// Test 2: Check post title extraction
function testPostTitleExtraction() {
    console.log('📝 Post Title Extraction Test:');
    
    const titleSelectors = [
        '[data-test-id="post-content"] h1',
        '[data-adclicklocation="title"] h1',
        'h1[tabindex="-1"]',
        '[slot="title"]',
        '.Post h3',
        'h3._eYtD2XCVieq6emjKBH3m'
    ];
    
    let foundTitle = '';
    let usedSelector = '';
    
    for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            foundTitle = element.textContent.trim();
            usedSelector = selector;
            break;
        }
    }
    
    console.log(`  - Found Title: "${foundTitle}"`);
    console.log(`  - Using Selector: "${usedSelector}"`);
    console.log(`  - Page Title: "${document.title}"`);
    
    return foundTitle;
}

// Test 3: Test Reddit JSON API access
async function testRedditAPI() {
    console.log('🔌 Reddit API Test:');
    
    try {
        const jsonUrl = window.location.href.replace(/\/$/, '') + '.json?limit=10';
        console.log(`  - Fetching: ${jsonUrl}`);
        
        const response = await fetch(jsonUrl, {
            headers: {
                'User-Agent': 'Reddit Topic Summarizer Test Script'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log('  - ✅ API Response received');
        console.log(`  - Post Title: "${data[0].data.children[0].data.title}"`);
        console.log(`  - Comments Count: ${data[1].data.children.length}`);
        
        // Test comment extraction
        let totalComments = 0;
        function countComments(children) {
            children.forEach(child => {
                if (child.kind === 't1') {
                    totalComments++;
                    if (child.data.replies && child.data.replies.data) {
                        countComments(child.data.replies.data.children);
                    }
                }
            });
        }
        
        countComments(data[1].data.children);
        console.log(`  - Total Comments (including replies): ${totalComments}`);
        
        return { success: true, commentCount: totalComments };
        
    } catch (error) {
        console.log(`  - ❌ API Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Test 4: Test text cleaning function
function testTextCleaning() {
    console.log('🧹 Text Cleaning Test:');
    
    const testTexts = [
        'This is a **bold** text with *italic* and ~~strikethrough~~',
        'Check out this link: https://example.com/test',
        'Multiple\n\nline\nbreaks    and   spaces',
        '^(superscript) text here'
    ];
    
    function cleanText(text) {
        // Remove URLs
        text = text.replace(/https?:\/\/[^\s]+/g, '');
        // Remove Reddit markdown
        text = text.replace(/\*\*(.*?)\*\*/g, '$1');
        text = text.replace(/\*(.*?)\*/g, '$1');
        text = text.replace(/~~(.*?)~~/g, '$1');
        text = text.replace(/\^(\w+)/g, '$1');
        // Remove excessive whitespace
        text = text.replace(/\n+/g, ' ');
        text = text.replace(/\s+/g, ' ');
        return text.trim().toLowerCase();
    }
    
    testTexts.forEach((text, index) => {
        const cleaned = cleanText(text);
        console.log(`  - Test ${index + 1}:`);
        console.log(`    Original: "${text}"`);
        console.log(`    Cleaned:  "${cleaned}"`);
    });
}

// Test 5: Check extension permissions and storage
function testExtensionEnvironment() {
    console.log('🔧 Extension Environment Test:');
    
    const hasChrome = typeof chrome !== 'undefined';
    const hasStorage = hasChrome && chrome.storage;
    const hasRuntime = hasChrome && chrome.runtime;
    const hasTabs = hasChrome && chrome.tabs;
    
    console.log(`  - Chrome API Available: ${hasChrome}`);
    console.log(`  - Storage API: ${hasStorage ? '✅' : '❌'}`);
    console.log(`  - Runtime API: ${hasRuntime ? '✅' : '❌'}`);
    console.log(`  - Tabs API: ${hasTabs ? '✅' : '❌'}`);
    
    if (hasStorage) {
        // Test storage
        chrome.storage.sync.get(['openaiApiKey'], (result) => {
            console.log(`  - Stored API Key: ${result.openaiApiKey ? 'Found' : 'Not found'}`);
        });
    }
}

// Test 6: Simulate topic modeling
function testTopicModeling() {
    console.log('🧠 Topic Modeling Simulation:');
    
    const sampleComments = [
        'I think AI is really interesting and useful',
        'Machine learning has so many applications',
        'The future of technology looks bright',
        'AI will change how we work and live',
        'Natural language processing is fascinating',
        'Deep learning models are getting better',
        'Technology advancement is accelerating'
    ];
    
    console.log(`  - Sample Comments: ${sampleComments.length}`);
    
    // Simple word frequency analysis
    const wordFreq = {};
    const stopWords = new Set(['the', 'is', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this', 'it', 'will', 'has', 'have', 'so', 'we', 'how', 'are']);
    
    sampleComments.forEach(comment => {
        comment.toLowerCase().split(/\s+/).forEach(word => {
            word = word.replace(/[^\w]/g, '');
            if (word.length > 2 && !stopWords.has(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });
    });
    
    const topWords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    console.log('  - Top Keywords:');
    topWords.forEach(([word, count]) => {
        console.log(`    "${word}": ${count} occurrences`);
    });
    
    return topWords;
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Running All Tests...\n');
    
    // Test 1
    const redditDetected = testRedditDetection();
    console.log('');
    
    // Test 2
    const postTitle = testPostTitleExtraction();
    console.log('');
    
    // Test 3 (only if on Reddit)
    if (redditDetected) {
        const apiTest = await testRedditAPI();
        console.log('');
    }
    
    // Test 4
    testTextCleaning();
    console.log('');
    
    // Test 5
    testExtensionEnvironment();
    console.log('');
    
    // Test 6
    const topics = testTopicModeling();
    console.log('');
    
    console.log('✅ All tests completed!');
    console.log('=====================================');
    
    return {
        redditDetected,
        postTitle,
        topics
    };
}

// Auto-run tests
runAllTests();
