import sys
import os
import datetime

# Add the parent directory to sys.path to import scraper
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scraper import RSSScraper

def test_rss_scraper_class():
    print("Testing RSSScraper class from scraper.py...")
    scraper = RSSScraper()
    posts = scraper.fetch_recent(subreddit="politics", limit=5)
    
    print(f"Number of posts fetched: {len(posts)}")
    for post in posts:
        print(f"\nID: {post['id']}")
        print(f"Author: {post['author']}")
        print(f"Text: {post['text'][:100]}...")
        print(f"Source: {post['source']}")

if __name__ == "__main__":
    test_rss_scraper_class()


if __name__ == "__main__":
    test_rss()
