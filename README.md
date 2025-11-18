# Reddit Topic Summarizer Chrome Extension

An AI-powered Chrome extension that analyzes Reddit discussions and provides intelligent topic modeling and summarization using BERTopic and OpenAI.

## 🚀 Features

- **Advanced Topic Modeling**: Utilizes BERTopic for sophisticated topic identification and clustering
- **AI-Powered Summaries**: Generates concise summaries of Reddit discussions using OpenAI
- **Real-time Progress Tracking**: Shows analysis progress with percentage updates
- **Modern UI**: Clean, responsive interface built with Bootstrap 5
- **Privacy-Focused**: All processing happens on your local machine or specified server

## ⏳ Analysis Time

The analysis time varies based on:
- Number of comments (typically 30 seconds to 5 minutes)
- Complexity of the discussion
- Server resources and model configuration

**Note**: For posts with many comments (100+), the analysis might take several minutes. The extension shows progress updates during this time.

## 📋 Prerequisites

1. **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Python 3.8+**: Required for the backend server
3. **Chrome Browser**: Version 88 or higher
4. **Reddit Access**: Works on reddit.com and old.reddit.com

## 📁 File Structure

```
reddit-topic-summarizer/
├── bertopic_api.py         # Backend server for topic modeling
├── background.js           # Background service worker
├── content.js              # Reddit page integration
├── content.css             # Content styles
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── manifest.json           # Extension configuration
├── popup.html              # Main interface
├── popup.js                # Popup logic
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

## 🛠️ Setup

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
python bertopic_api.py
```

### 3. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked" and select the extension directory
4. Pin the extension for easy access

### 4. Configure Extension

- Set your OpenAI API key in the extension popup
- Configure the backend URL in `background.js` if not using default (`http://localhost:5001`)

Create simple 16x16, 32x32, 48x48, and 128x128 pixel PNG icons or use these placeholder dimensions:

- **icon16.png**: 16×16 pixels
- **icon32.png**: 32×32 pixels  
- **icon48.png**: 48×48 pixels
- **icon128.png**: 128×128 pixels

You can create simple colored squares with "🧠" emoji or use any image editor.

## 🧩 How It Works

1. **Data Collection**:
   - Scrapes Reddit post and comments
   - Cleans and preprocesses the text

2. **Topic Modeling**:
   - Uses BERTopic to identify topics in the comments
   - Generates topic labels and representative words
   - Handles large comment threads efficiently

3. **Summarization**:
   - Creates a summary of the overall discussion
   - Uses OpenAI for coherent, context-aware summaries
   - Maintains key discussion points and themes

4. **Results Display**:
   - Shows topics with representative comments
   - Displays a comprehensive summary
   - Provides analysis statistics and metrics

## ⚙️ Configuration

### Backend (`bertopic_api.py`)

- `EMBEDDING_MODEL`: Choose between 'all-MiniLM-L6-v2' (faster) or 'all-mpnet-base-v2' (more accurate)
- `OPENAI_API_KEY`: Your OpenAI API key for enhanced summarization
- `PORT`: Server port (default: 5001)
- `BATCH_SIZE`: Number of comments to process at once (adjust based on available RAM)

### Extension (`background.js`)

- `BERTOPIC_API_URL`: Backend server URL (default: `http://localhost:5001`)
- `MAX_COMMENTS`: Maximum number of comments to process (default: 500)
- `MIN_COMMENT_LENGTH`: Minimum comment length to include in analysis (default: 20 characters)

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

1. **Server Connection Failed**:
   - Ensure the backend server is running (`python bertopic_api.py`)
   - Check if the port in the extension matches the server port (default: 5001)
   - Verify CORS settings in the backend

2. **Long Analysis Time**:
   - For large threads (>200 comments), analysis may take several minutes
   - Use a smaller embedding model for faster processing
   - Check server logs for performance bottlenecks
   - Consider increasing `BATCH_SIZE` in `bertopic_api.py` if you have sufficient RAM

3. **API Errors**:
   - Verify your OpenAI API key is valid and has sufficient credits
   - Check your API rate limits
   - Ensure the key has access to the required models

4. **Memory Issues**:
   - For large posts, the backend may require significant RAM
   - Reduce `MAX_COMMENTS` in `background.js` for very large threads
   - Close other memory-intensive applications

### Performance Tips

- **Optimal Post Size**: 50-300 comments provide the best balance of speed and quality
- **Model Selection**:
  - `all-MiniLM-L6-v2`: Faster, lower resource usage
  - `all-mpnet-base-v2`: More accurate, higher resource usage
- **Hardware**:
  - 8GB+ RAM recommended for larger analyses
  - SSD storage improves model loading times

### Expected Performance

| Comment Count | Expected Time | Notes                             |
|---------------|---------------|-----------------------------------|
| < 50          | 30-60 sec     | Quick analysis                    |
| 50-200        | 1-3 min       | Good balance of speed and quality |
| 200-500       | 3-10 min      | Consider reducing comment count   |
| 500+          | 10+ min       | May require optimization          |

### Error Messages

- `"Server connection failed"` → Check if backend server is running
- `"Invalid API response"` → Check server logs for details
- `"Analysis timed out"` → Try with fewer comments or better hardware
- `"Memory allocation failed"` → Reduce batch size or comment count

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

## 📊 Performance Optimization

1. **For Faster Analysis**:
   - Use `all-MiniLM-L6-v2` embedding model
   - Reduce `MAX_COMMENTS` in `background.js`
   - Decrease `BATCH_SIZE` in `bertopic_api.py` for low-memory systems

2. **For Better Accuracy**:
   - Use `all-mpnet-base-v2` embedding model
   - Increase `BATCH_SIZE` for more context
   - Process more comments (up to 1000 with sufficient RAM)

3. **Resource Management**:
   - Monitor memory usage during analysis
   - Close other memory-intensive applications
   - Consider using a machine with more RAM for large analyses

## 🤝 Contributing

1. **Development Setup**:
   ```bash
   # Clone the repository
   git clone [your-repo-url]
   cd reddit-topic-summarizer
   
   # Set up Python virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Making Changes**:
   - Follow the existing code style
   - Add comments for complex logic
   - Test with various Reddit posts
   - Check browser console and server logs

3. **Submitting Changes**:
   - Create a new branch for your feature/fix
   - Write clear commit messages
   - Open a pull request with a detailed description

## 📝 License

This project is open source. Feel free to modify and distribute.

## ⚠️ Disclaimers

- Requires active OpenAI API key with credits
- Analysis quality depends on comment quality and quantity
- Reddit API rate limits may apply for very frequent usage
- Extension is for educational and personal use
