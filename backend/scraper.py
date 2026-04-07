import random
import time
import datetime
import threading
from collections import deque
import feedparser
from newsapi import NewsApiClient

# Simulated political headlines and templates for Mock Mode
MOCK_TOPICS = ["Economy", "Election", "Healthcare", "Climate Policy", "Foreign Relations", "Education", "Infrastructure", "Trade Wars"]
MOCK_SENTIMENTS = {
    "positive": [
        "I'm really impressed with the new {topic} bill, it's a huge step forward!",
        "The recent improvements in {topic} are making everyone optimistic about the future.",
        "{topic} reforms are finally paying off, great news for the country.",
        "A historic win for {topic}! This is what we needed.",
        "Feeling positive about the direction we're headed with {topic}."
    ],
    "negative": [
        "The {topic} situation is a complete mess right now.",
        "I'm worried that the new {topic} policy will do more harm than good.",
        "Total failure in {topic} management, it's a disaster.",
        "Why is nobody talking about how bad the {topic} crisis is getting?",
        "Extremely disappointed with the latest {topic} update."
    ],
    "neutral": [
        "The debate on {topic} continues today at the capitol.",
        "New statistics on {topic} were released this morning.",
        "Official statement regarding {topic} expected tomorrow.",
        "Research shows mixed results in the {topic} field.",
        "Looking for more facts about the current state of {topic}."
    ]
}

class RedditScraper:
    def __init__(self, client_id=None, client_secret=None, user_agent="PoliticalSentimentBot/1.0"):
        self.enabled = False
        if client_id and client_secret:
            try:
                import praw
                self.reddit = praw.Reddit(
                    client_id=client_id,
                    client_secret=client_secret,
                    user_agent=user_agent
                )
                self.enabled = True
            except Exception as e:
                print(f"Failed to initialize Reddit API: {e}")

    def fetch_recent(self, subreddit="politics", limit=10):
        if not self.enabled:
            return []
        try:
            posts = []
            for submission in self.reddit.subreddit(subreddit).new(limit=limit):
                posts.append({
                    "id": submission.id,
                    "text": f"{submission.title} {submission.selftext[:200]}",
                    "timestamp": datetime.datetime.fromtimestamp(submission.created_utc).isoformat(),
                    "source": "Reddit",
                    "author": f"u/{submission.author}"
                })
            return posts
        except Exception as e:
            print(f"Error fetching from Reddit: {e}")
            return []

class NewsScraper:
    def __init__(self, api_key=None):
        self.enabled = False
        if api_key:
            try:
                self.newsapi = NewsApiClient(api_key=api_key)
                self.enabled = True
            except Exception as e:
                print(f"Failed to initialize NewsAPI: {e}")

    def fetch_recent(self, query="politics", limit=10):
        if not self.enabled:
            return []
        try:
            articles = self.newsapi.get_everything(q=query, sort_by='publishedAt', page_size=limit, language='en')
            posts = []
            for art in articles.get('articles', []):
                posts.append({
                    "id": f"news_{art['url'][-10:]}",
                    "text": f"{art['title']}. {art['description'] or ''}",
                    "timestamp": art['publishedAt'],
                    "source": art['source']['name'],
                    "author": art['author'] or "Journalist"
                })
            return posts
        except Exception as e:
            print(f"Error fetching from NewsAPI: {e}")
            return []

class RSSScraper:
    def fetch_recent(self, subreddit="politics", limit=10):
        try:
            url = f"https://www.reddit.com/r/{subreddit}/new/.rss"
            feed = feedparser.parse(url, agent="Mozilla/5.0 (Windows NT 10.0) PoliticsTracker/1.0")
            posts = []
            now_iso = datetime.datetime.now().isoformat()
            for entry in feed.entries[:limit]:
                author = getattr(entry, 'author', "Anonymous")
                if "reddit.com" in url:
                    if author.startswith("/u/"):
                        author = author[1:] # /u/name -> u/name
                    elif not author.startswith("u/"):
                        author = f"u/{author}"
                
                posts.append({
                    "id": entry.id,
                    "text": entry.title,
                    "timestamp": now_iso,
                    "source": "Reddit RSS",
                    "author": author
                })
            return posts
        except Exception as e:
            print(f"Error fetching from RSS: {e}")
            return []

class MockScraper:
    def generate_post(self):
        sentiment_type = random.choices(["positive", "negative", "neutral"], weights=[30, 40, 30])[0]
        topic = random.choice(MOCK_TOPICS)
        template = random.choice(MOCK_SENTIMENTS[sentiment_type])
        
        entities = [topic, random.choice(["Gov", "Policy", "Reform", "Budget", "Debate"])]
        
        return {
            "id": f"mock_{random.randint(10000, 99999)}",
            "text": template.format(topic=topic),
            "timestamp": datetime.datetime.now().isoformat(),
            "source": "MockStream",
            "author": f"User_{random.randint(100, 999)}",
            "entities": entities
        }

class PoliticalStreamer:
    def __init__(self, analyzer, reddit_keys=None, news_api_key=None):
        self.analyzer = analyzer
        self.reddit = RedditScraper(**(reddit_keys or {}))
        self.news = NewsScraper(api_key=news_api_key)
        self.rss = RSSScraper()
        self.mock = MockScraper()
        
        self.buffers = {
            "mock": deque(maxlen=100),
            "news": deque(maxlen=100),
            "live": deque(maxlen=100),
            "rss": deque(maxlen=100)
        }
        self.stats_history = deque(maxlen=50)
        self.entity_counts = {}
        self.known_ids = set() # O(1) lookup for duplicates
        
        # Statistics Rolling Accumulators for O(1) updates
        self._rolling_window = deque(maxlen=20)
        self._sum_score = 0.0
        self._pos_count = 0
        self._neg_count = 0
        
        self.pending_queue = deque()
        self._last_fetch_time = 0
        self._running = False
        self._thread = None
        
        if self.reddit.enabled:
            self._mode = "live"
        elif self.news.enabled:
            self._mode = "news"
        else:
            self._mode = "mock"

    @property
    def mode(self):
        return self._mode

    @mode.setter
    def mode(self, value):
        if value != self._mode:
            self._mode = value
            self.pending_queue.clear()
            self._last_fetch_time = 0 # Trigger immediate fetch

    def _stream_worker(self):
        print(f"Background streamer worker started in mode: {self.mode}")
        while self._running:
            try:
                active_mode = self.mode # Capture current mode for the entire iteration
                if not self.pending_queue:
                    current_time = time.time()
                    if current_time - self._last_fetch_time > 60:
                        new_posts = []
                        if active_mode == "live":
                            new_posts = self.reddit.fetch_recent(limit=20)
                        elif active_mode == "news":
                            new_posts = self.news.fetch_recent(limit=20)
                        elif active_mode == "rss":
                            new_posts = self.rss.fetch_recent(limit=25)
                        
                        if new_posts:
                            for post in new_posts:
                                if post['id'] not in self.known_ids:
                                    self.pending_queue.append(post)
                            self._last_fetch_time = current_time

                if self.pending_queue:
                    post = self.pending_queue.popleft()
                    post['entities'] = [w for w in post['text'].split() if len(w) > 5][:3]
                    self._process_and_add(post, active_mode)
                else:
                    self._process_and_add(self.mock.generate_post(), "mock")
                
                self._update_stats_rolling()
            except Exception as e:
                print(f"ERROR in streamer worker: {e}")
                # Wait a bit longer if we error to avoid spamming the logs
                time.sleep(5)
            
            time.sleep(random.uniform(1.2, 2.5))

    def _process_and_add(self, post, mode):
        analysis = self.analyzer.get_sentiment(post['text'])
        post.update(analysis)
        
        # Maintain mode-specific buffer and ID set
        target_buffer = self.buffers.get(mode, self.buffers["mock"])
        if len(target_buffer) >= target_buffer.maxlen:
             old_post = target_buffer.pop()
             self.known_ids.discard(old_post['id'])
        
        target_buffer.appendleft(post)
        self.known_ids.add(post['id'])
        
        # Update rolling statistics window
        if len(self._rolling_window) >= self._rolling_window.maxlen:
            old = self._rolling_window.pop()
            self._sum_score -= old['score']
            if old['sentiment'] == "positive": self._pos_count -= 1
            elif old['sentiment'] == "negative": self._neg_count -= 1
            
        self._rolling_window.appendleft(post)
        self._sum_score += post['score']
        if post['sentiment'] == "positive": self._pos_count += 1
        elif post['sentiment'] == "negative": self._neg_count += 1

        for ent in post.get('entities', []):
            self.entity_counts[ent] = self.entity_counts.get(ent, 0) + 1

    def _update_stats_rolling(self):
        count = len(self._rolling_window)
        if count == 0: return
        
        self.stats_history.append({
            "timestamp": datetime.datetime.now().isoformat(),
            "avg_sentiment": round(self._sum_score / count, 3),
            "pos_ratio": round(self._pos_count / count, 2),
            "neg_ratio": round(self._neg_count / count, 2),
            "volume": len(self.buffers[self.mode])
        })

    def start(self):
        if not self._running:
            self._running = True
            self._thread = threading.Thread(target=self._stream_worker, daemon=True)
            self._thread.start()

    def stop(self):
        self._running = False

    def get_snapshot(self):
        top_entities = sorted(self.entity_counts.items(), key=lambda x: x[1], reverse=True)[:8]
        
        # Determine the best posts to show
        mode_posts = list(self.buffers.get(self.mode, []))[:15]
        fallback_posts = []
        
        # If active mode is empty, provide mock posts as a temporary fallback
        if not mode_posts and self.mode != "mock":
            fallback_posts = list(self.buffers.get("mock", []))[:10]

        return {
            "latest_posts": mode_posts,
            "fallback_posts": fallback_posts,
            "history": list(self.stats_history),
            "trending": [{"name": k, "count": v} for k, v in top_entities],
            "summary": self.stats_history[-1] if self.stats_history else {},
            "mode": self.mode
        }
