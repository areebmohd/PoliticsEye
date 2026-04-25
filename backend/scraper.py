import random
import time
import datetime
import threading
from collections import deque
import feedparser
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from newsapi import NewsApiClient

def create_session():
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

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
    def __init__(self):
        self.session = create_session()
        
    def fetch_recent(self, subreddit="politics", limit=10):
        try:
            url = f"https://www.reddit.com/r/{subreddit}/new/.rss"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
            }
            
            response = self.session.get(url, headers=headers, timeout=20)
            if response.status_code != 200:
                print(f"Error fetching RSS: {response.status_code}")
                return []
                
            feed = feedparser.parse(response.content)
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

class MastodonScraper:
    def __init__(self):
        self.session = create_session()

    def fetch_recent(self, hashtag="politics", limit=10):
        try:
            url = f"https://mastodon.social/tags/{hashtag}.rss"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            }
            
            response = self.session.get(url, headers=headers, timeout=20)
            if response.status_code != 200:
                print(f"Error fetching Mastodon: {response.status_code}")
                return []
                
            import re
            def clean_html(raw_html):
                # Remove HTML tags and convert entities
                cleanr = re.compile('<.*?>')
                cleantext = re.sub(cleanr, '', raw_html)
                return cleantext

            feed = feedparser.parse(response.content)
            posts = []
            now_iso = datetime.datetime.now().isoformat()
            for entry in feed.entries[:limit]:
                # Mastodon RSS uses 'summary' for the content
                text = clean_html(getattr(entry, 'summary', ''))
                
                # Extract username from the URL (e.g., https://mastodon.social/@name/123)
                author = "Anonymous"
                url_to_parse = getattr(entry, 'id', getattr(entry, 'link', ''))
                if "/@" in url_to_parse:
                    try:
                        # Extract the part after /@ and before the next /
                        author = url_to_parse.split('/@')[1].split('/')[0]
                        author = f"@{author}"
                    except:
                        pass
                
                posts.append({
                    "id": entry.id,
                    "text": text,
                    "timestamp": now_iso,
                    "source": "Mastodon",
                    "author": author
                })
            return posts
        except Exception as e:
            print(f"Error fetching from Mastodon: {e}")
            return []

class YouTubeScraper:
    def __init__(self):
        self.session = create_session()
        self.channels = {
            "CNN": "UCupvZG-5ko_eiXAupbDfxWw",
            "BBC News": "UCR1j0aJUd-P8q-qJ1Oa4r7A",
            "PBS NewsHour": "UC6ZFNrNNn3tfLuV0EwV5pTg",
            "Al Jazeera": "UCNye-wNBqNL5ZzHSJj3l8BA",
            "DW News": "UCknLrEdhRCp1a-MRaOQfl6Q",
            "Sky News": "UChnyuAM_W7p-M_0-R-lH08Q",
            "Fox News": "UCXIJgqnII2ZOINSWNOGFThA",
            "MSNBC": "UC8pTidpI-7_K7K_V_3-jI-A",
            "France 24": "UCQfwfsi5VrQ8yKZ-UWmAEFg",
            "The Economist": "UC0p5jTq_LMB_U_K-I_D-R-g",
            "CNBC": "UCvjjW_u-O-X8txL1atvIq-A",
            "Bloomberg": "UCIALMKvObAkS16F082M0IYA"
        }

    def fetch_recent(self, limit=5):
        all_posts = []
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }
        
        for name, channel_id in self.channels.items():
            try:
                # Add a small random delay to avoid rate limiting
                time.sleep(random.uniform(0.5, 1.5))
                
                url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
                response = self.session.get(url, headers=headers, timeout=20)
                if response.status_code == 200:
                    feed = feedparser.parse(response.text)
                    for entry in feed.entries[:limit]:
                        all_posts.append({
                            "id": entry.id,
                            "text": f"VIDEO: {entry.title}",
                            "timestamp": getattr(entry, 'published', datetime.datetime.now().isoformat()),
                            "source": "YouTube",
                            "author": name
                        })
                else:
                    print(f"YouTube {name} status: {response.status_code}")
            except Exception as e:
                print(f"Error fetching from YouTube channel {name}: {e}")
                
        return all_posts

class TwitterScraper:
    def __init__(self):
        self.session = create_session()
        # Verified working public RSS feeds for political news (as of 2026)
        self.sources = {
            "BBC Politics": "http://feeds.bbci.co.uk/news/politics/rss.xml",
            "NYT Politics": "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml"
        }

    def fetch_recent(self, limit=10):
        all_posts = []
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        }
        
        now_iso = datetime.datetime.now().isoformat()
        
        for name, url in self.sources.items():
            try:
                response = self.session.get(url, headers=headers, timeout=20)
                if response.status_code == 200:
                    feed = feedparser.parse(response.content)
                    for entry in feed.entries[:limit]:
                        all_posts.append({
                            "id": entry.get('id', entry.get('link', str(random.random()))),
                            "text": f"TOP STORY: {entry.title}",
                            "timestamp": getattr(entry, 'published', now_iso),
                            "source": "Twitter", # Keeping the label for UI continuity
                            "author": name
                        })
            except Exception as e:
                print(f"Error fetching from Twitter Pivot {name}: {e}")
                
        return all_posts

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

from db_manager import MongoManager

class PoliticalStreamer:
    def __init__(self, analyzer, reddit_keys=None, news_api_key=None):
        self.analyzer = analyzer
        self.db = MongoManager() # Initialize MongoDB
        self.reddit = RedditScraper(**(reddit_keys or {}))
        self.news = NewsScraper(api_key=news_api_key)
        self.rss = RSSScraper()
        self.mastodon = MastodonScraper()
        self.youtube = YouTubeScraper()
        self.twitter = TwitterScraper()
        self.mock = MockScraper()
        
        self.buffers = {
            "mock": deque(maxlen=100),
            "news": deque(maxlen=100),
            "mastodon": deque(maxlen=100),
            "rss": deque(maxlen=100),
            "youtube": deque(maxlen=100),
            "twitter": deque(maxlen=100)
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
        
        if self.news.enabled:
            self._mode = "news"
        else:
            self._mode = "rss"

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
                        if active_mode == "mastodon":
                            new_posts = self.mastodon.fetch_recent(limit=25)
                        elif active_mode == "youtube":
                            new_posts = self.youtube.fetch_recent(limit=5)
                        elif active_mode == "twitter":
                            new_posts = self.twitter.fetch_recent(limit=5)
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
        
        # PERSIST TO MONGODB
        self.db.save_post(post)
        
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
