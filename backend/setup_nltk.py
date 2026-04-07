import nltk
import os

def setup():
    print("Pre-loading NLTK data for production environment...")
    try:
        # Download stopwords for the analyzer
        nltk.download('stopwords')
        print("Successfully downloaded NLTK stopwords.")
    except Exception as e:
        print(f"Error downloading NLTK data: {e}")
        exit(1)

if __name__ == "__main__":
    setup()
