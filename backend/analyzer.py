import re
import nltk
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Regex patterns pre-compiled for performance
URL_PATTERN = re.compile(r'http\S+|www\S+|https\S+', re.MULTILINE)
MENTION_HASHTAG_PATTERN = re.compile(r'\@\w+|\#\w+')
CLEAN_CHARS_PATTERN = re.compile(r'[^a-zA-Z\s]')

# Ensure necessary NLTK data (though we're not currently using stopwords in the scoring)
try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

class PoliticalAnalyzer:
    def __init__(self):
        self.sia = SentimentIntensityAnalyzer()
        # Removed self.stop_words as it was unused and consuming memory

    def clean_text(self, text):
        """High-performance text cleaning using pre-compiled regex."""
        if not text:
            return ""
        
        # Combine operations: lowercase and initial character cleaning
        text = text.lower()
        
        # Remove URLs, mentions, hashtags
        text = URL_PATTERN.sub('', text)
        text = MENTION_HASHTAG_PATTERN.sub('', text)
        
        # Strip non-ASCII (emojis) efficiently
        text = text.encode('ascii', 'ignore').decode('ascii')
        
        # Strip special chars and numbers
        text = CLEAN_CHARS_PATTERN.sub('', text)
        
        # Trim whitespace
        return " ".join(text.split())

    def get_sentiment(self, text):
        """Returns a sentiment dictionary. Performance optimized."""
        cleaned = self.clean_text(text)
        if not cleaned:
            return {"sentiment": "neutral", "score": 0.0, "positive": 0.0, "negative": 0.0, "neutral": 1.0}
        
        # VADER is relatively fast, so we keep this call as-is
        scores = self.sia.polarity_scores(cleaned)
        compound = scores['compound']
        
        if compound >= 0.05:
            sentiment = "positive"
        elif compound <= -0.05:
            sentiment = "negative"
        else:
            sentiment = "neutral"
            
        return {
            "sentiment": sentiment,
            "score": compound,
            "positive": scores['pos'],
            "negative": scores['neg'],
            "neutral": scores['neu']
        }
