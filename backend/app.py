from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from dotenv import load_dotenv

from analyzer import PoliticalAnalyzer
from scraper import PoliticalStreamer

load_dotenv()

app = Flask(__name__)
# Enable CORS for the frontend development server
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
REDDIT_KEYS = {
    "client_id": os.getenv("REDDIT_CLIENT_ID"),
    "client_secret": os.getenv("REDDIT_CLIENT_SECRET"),
    "user_agent": os.getenv("REDDIT_USER_AGENT", "PoliticalSentimentBot/1.0")
}
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

# Initialize Core
analyzer = PoliticalAnalyzer()
streamer = PoliticalStreamer(
    analyzer, 
    reddit_keys=REDDIT_KEYS if REDDIT_KEYS['client_id'] else None,
    news_api_key=NEWS_API_KEY
)

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "status": "online",
        "message": "PoliticsEye Analysis Engine is active",
        "endpoints": ["/api/health", "/api/snapshot", "/api/toggle-mode"]
    })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "mode": streamer.mode,
        "streaming": streamer._running,
        "buffer_counts": {
            "mock": len(streamer.buffers["mock"]),
            "news": len(streamer.buffers["news"]),
            "live": len(streamer.buffers["live"]),
            "rss": len(streamer.buffers["rss"])
        }
    })

@app.route('/api/snapshot', methods=['GET'])
def get_snapshot():
    snapshot = streamer.get_snapshot()
    # Use the summary directly from the snapshot if available
    summary = snapshot.get('summary', {"avg_sentiment": 0, "pos_count": 0, "neg_count": 0, "total_count": 0})
    
    # Enrich summary with counts if not present
    if "pos_count" not in summary and snapshot['latest_posts']:
        summary["pos_count"] = sum(1 for p in snapshot['latest_posts'] if p['sentiment'] == "positive")
        summary["neg_count"] = sum(1 for p in snapshot['latest_posts'] if p['sentiment'] == "negative")
        summary["total_count"] = len(snapshot['latest_posts'])
        
    return jsonify({
        **snapshot,
        "summary": summary
    })

@app.route('/api/toggle-mode', methods=['POST'])
def toggle_mode():
    data = request.json
    requested_mode = data.get("mode")
    if requested_mode in ["mock", "live", "news", "rss"]:
        if requested_mode == "live" and not streamer.reddit.enabled:
            return jsonify({"success": False, "error": "Reddit API credentials missing"}), 400
        if requested_mode == "news" and not streamer.news.enabled:
            return jsonify({"success": False, "error": "NewsAPI Key missing in .env"}), 400
        
        streamer.mode = requested_mode
        return jsonify({"success": True, "new_mode": streamer.mode})
    return jsonify({"success": False, "error": "Invalid mode"}), 400

if __name__ == '__main__':
    streamer.start()
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
else:
    # This block is for production (e.g., Gunicorn)
    streamer.start()
