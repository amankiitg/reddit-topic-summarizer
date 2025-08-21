{
  "manifest_version": 3,
  "name": "Reddit Topic Summarizer",
  "version": "1.0",
  "description": "AI-powered topic modeling and summarization for Reddit posts",
  "permissions": [
    "activeTab",
    "storage",
    "https://api.openai.com/*",
    "https://reddit.com/*",
    "https://*.reddit.com/*"
  ],
  "host_permissions": [
    "https://reddit.com/*",
    "https://*.reddit.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://reddit.com/r/*/comments/*",
        "https://*.reddit.com/r/*/comments/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Reddit Topic Summarizer"
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
