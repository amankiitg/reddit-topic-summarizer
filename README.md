# Reddit Topic Summarizer Chrome Extension

An AI-powered Chrome extension that analyzes Reddit discussions and provides intelligent topic summaries using advanced NLP techniques.

## 🚀 Features

- **Intelligent Topic Modeling**: Analyzes Reddit comments using keyword frequency and co-occurrence
- **AI-Powered Summaries**: Uses OpenAI GPT-3.5 to generate concise discussion summaries
- **Real-time Analysis**: Works on any Reddit post page
- **Clean Interface**: Modern, intuitive popup design
- **Secure**: API keys stored locally in browser

## 📋 Prerequisites

1. **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Chrome Browser**: Version 88 or higher
3. **Reddit Access**: Works on reddit.com and old.reddit.com

## 📁 File Structure

```
reddit-topic-summarizer/
├── manifest.json           # Extension configuration
├── popup.html              # Main interface
├── popup.js                # Popup logic
├── background.js           # Background service worker
├── content.js              # Reddit page integration
├── content.css             # Content script styles
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## 🔧 Installation Steps

### Method 1: Load Unpacked Extension (Development)

1. **Download/Create the files**:
   - Create a new folder called `reddit-topic-summarizer`
   - Save all the provided files in this folder
   - Create an `icons` folder and add extension icons (see Icons section below)

2. **Open Chrome Extensions**:
   - Go to `chrome://extensions/` in your Chrome browser
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the extension**:
   - Click "Load unpacked"
   - Select the `reddit-topic-summarizer` folder
   - The extension should appear in your extensions list

4. **Pin the extension**:
   - Click the extensions icon (puzzle piece) in Chrome toolbar
   - Pin "Reddit Topic Summarizer" for easy access

### Method 2: Create Icons

Create simple 16x16, 32x32, 48x48, and 128x128 pixel PNG icons or use these placeholder dimensions:

- **icon16.png**: 16×16 pixels
- **icon32.png**: 32×32 pixels  
- **icon48.png**: 48×48 pixels
- **icon128.png**: 128×128 pixels

You can create simple colored squares with "🧠" emoji or use any image editor.

## 🔑 Setup & Usage

### Initial Setup

1. **Get OpenAI API Key**:
   - Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create an account and generate an API key
   - Copy the key (starts with `sk-`)

2. **Configure Extension**:
   - Click the extension icon in Chrome toolbar
   - Paste your OpenAI API key in the input field
   - Key is automatically saved for future use

### Using the Extension

1. **Navigate to Reddit Post**:
   - Go to any Reddit post (e.g., `reddit.com/r/askreddit/comments/...`)
   - The extension will detect you're on a Reddit post page

2. **Analyze Discussion**:
   - Click the extension icon
   - Click "🔍 Analyze Discussion" button
   - Wait 1-2 minutes for analysis (depends on comment count)

3. **View Results**:
   - Click "📊 View Summary" when analysis completes
   - Review AI-generated summary and key topics
   - Results are cached for each post

## 🛠️ Technical Details

### How It Works

1. **Data Extraction**: Uses Reddit's JSON API to fetch post and comment data
2. **Text Processing**: Cleans and filters comments based on score and length
3. **Topic Modeling**: Performs keyword frequency analysis and co-occurrence grouping
4. **AI Summary**: Sends topics to OpenAI API for intelligent summarization
5. **Caching**: Stores results locally to avoid re-analysis

### API Usage

- **Reddit API**: Public JSON endpoints (no authentication required)
- **OpenAI API**: Requires API key, uses GPT-3.5-turbo model
- **Rate Limits**: Respects both Reddit and OpenAI rate limits

### Privacy & Security

- **Local Storage**: API keys and results stored locally in browser
- **No Data Collection**: Extension doesn't send data to external servers (except OpenAI)
- **Secure**: Uses HTTPS for all API calls

## 🎯 Supported Reddit Formats

- ✅ New Reddit (`reddit.com`)
- ✅ Old Reddit (`old.reddit.com`) 
- ✅ Mobile Reddit (`m.reddit.com`)
- ✅ Any subreddit post with comments

## 🐛 Troubleshooting

### Common Issues

**Extension not detecting Reddit post:**
- Ensure URL contains `/r/[subreddit]/comments/`
- Refresh the page and try again
- Check that you're not on Reddit homepage

**API key not working:**
- Verify key starts with `sk-`
- Check OpenAI account has credits
- Ensure key has proper permissions

**Analysis taking too long:**
- Large posts (500+ comments) may take 2-3 minutes
- Check internet connection
- Try refreshing and analyzing again

**No summary generated:**
- Check OpenAI API key and credits
- Try with a smaller post first
- Check browser console for errors (F12)

### Error Messages

- `"Please enter your OpenAI API key"` → Add API key in extension popup
- `"Please navigate to a Reddit post"` → Go to a Reddit post page
- `"Failed to fetch Reddit data"` → Check internet connection, try different post
- `"OpenAI API error"` → Check API key and OpenAI account status

## 🔄 Updates & Maintenance

### Updating the Extension

1. Replace files in the extension folder
2. Go to `chrome://extensions/`
3. Click refresh icon on the extension card
4. Test functionality

### Storage Management

- Analysis results are cached per post URL
- Clear cache: Go to `chrome://extensions/` → Extension details → Storage
- API keys persist until manually changed

## 📊 Performance Tips

- **Best Results**: Posts with 20-200 comments work best
- **Speed**: Smaller posts analyze faster
- **Quality**: Higher-scored comments produce better topics
- **Cost**: Each analysis uses ~$0.01-0.05 in OpenAI credits

## 🤝 Contributing

To modify or improve the extension:

1. Edit the relevant files
2. Reload extension in `chrome://extensions/`
3. Test on various Reddit posts
4. Check browser console for errors

## 📝 License

This project is open source. Feel free to modify and distribute.

## ⚠️ Disclaimers

- Requires active OpenAI API key with credits
- Analysis quality depends on comment quality and quantity
- Reddit API rate limits may apply for very frequent usage
- Extension is for educational and personal use
