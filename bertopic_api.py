from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import numpy as np
import openai
from sentence_transformers import SentenceTransformer
from umap import UMAP
from hdbscan import HDBSCAN
from bertopic import BERTopic
# from bertopic.representation import OpenAI as BertopicOpenAI
from openai_representation import StableOpenAIRepresentation

import logging
from copy import deepcopy
from transformers import pipeline, AutoModelForCausalLM, AutoTokenizer
import torch
import json
import sys

import re

MIN_LENGTH = 12        # Below this BERTopic breaks
MAX_LENGTH = 3000      # Prevent oversized OpenAI prompts

def normalize_text(text):
    """Remove control characters and normalize basic punctuation."""
    if not isinstance(text, str):
        return ""
    # Remove strange control chars
    text = re.sub(r"[\x00-\x1F\x7F]", " ", text)
    return text.strip()

def pad_short_text(text):
    """BERTopic triggers errors with very short documents, so pad them."""
    if len(text) >= MIN_LENGTH:
        return text
    if len(text) == 0:
        return ""
    # Pad by repetition to reach safe length
    needed = MIN_LENGTH - len(text)
    return text + " " + text[:needed]

def truncate_long_text(text):
    """Cap document length to keep OpenAI prompt sizes in check."""
    if len(text) <= MAX_LENGTH:
        return text
    return text[:MAX_LENGTH]


def clean_comments(comments):
    """Clean and validate comments for BERTopic processing with detailed logging"""
    print("\n=== Starting comment cleaning ===")
    print(f"Initial comments count: {len(comments)}")

    cleaned = []
    for i, c in enumerate(comments):
        print(f"\nProcessing comment {i}:")
        print(f"Original type: {type(c)}, length: {len(str(c)) if c else 0}")

        if not c:
            print("Skipping empty comment")
            continue

        # Ensure it's a string
        text = str(c) if not isinstance(c, str) else c
        print(f"After string conversion - length: {len(text)}")

        # Normalize and clean the text
        text = normalize_text(text)
        print(f"After normalization - length: {len(text)}")

        if not text.strip():
            print("Skipping empty text after normalization")
            continue

        # Ensure minimum and maximum length requirements
        orig_length = len(text)
        text = pad_short_text(text)
        if len(text) > orig_length:
            print(f"Padded text from {orig_length} to {len(text)} characters")

        text = truncate_long_text(text)
        if len(text) < orig_length:
            print(f"Truncated text from {orig_length} to {len(text)} characters")

        cleaned.append(text)
        print(f"Added to cleaned comments. Current count: {len(cleaned)}")

    # Ensure we have at least 3 documents (BERTopic minimum)
    if len(cleaned) < 3:
        print(f"\nWarning: Only {len(cleaned)} valid comments found. Adding placeholders.")
        while len(cleaned) < 3:
            placeholder = f"placeholder document {len(cleaned)}"
            print(f"Adding placeholder: {placeholder}")
            cleaned.append(placeholder)

    print(f"\n=== Finished cleaning ===\nTotal valid comments: {len(cleaned)}")
    print("Sample of cleaned comments:")
    for i, c in enumerate(cleaned[:3]):  # Show first 3 samples
        print(f"{i + 1}. {c[:100]}{'...' if len(c) > 100 else ''}")

    return cleaned


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Enable CORS with explicit configuration
CORS(app, resources={
    r"/*": {
        "origins": ["chrome-extension://*", "http://localhost:*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Global model cache
model_cache = {
    'embedding': None,
    'summarizer': None
}


def get_embedding_model():
    """Get or create the embedding model"""
    if model_cache['embedding'] is None:
        logger.info("Loading embedding model...")
        model_cache['embedding'] = SentenceTransformer("sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
    return model_cache['embedding']


from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer


# Update the create_bertopic_model function
def create_bertopic_model(openai_api_key=None):
    """
    Create and return a BERTopic model with simplified configuration
    Returns: tuple of (topic_model, embedding_model)
    """
    # Step 1: Create embedding model - using a smaller, faster model
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

    # Step 2: Use PCA for dimensionality reduction (faster than UMAP)
    umap_model = PCA(n_components=5, random_state=42)

    # Step 3: Use KMeans for clustering (more stable than HDBSCAN)
    hdbscan_model = KMeans(n_clusters=5, random_state=42, n_init=10)

    # Step 4: Create BERTopic model
    topic_model = BERTopic(
        embedding_model=embedding_model,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        language="english",
        calculate_probabilities=True,
        verbose=True
    )

    return topic_model, embedding_model


# Update the update_topics_with_huggingface function
def update_topics_with_huggingface(topic_model, comments):
    """Update topic representations using a simpler Hugging Face model"""
    try:
        logger.info("Updating topics with Hugging Face...")
        updated_model = deepcopy(topic_model)

        # Use a simpler, faster model for representation
        representation_model = {
            "model": "all-MiniLM-L6-v2",  # Same as our embedding model
            "exponent_scale": 0.9,
            "word_length": 10  # Shorter word length for faster processing
        }

        # Update model with Hugging Face representation
        updated_model.update_topics(
            comments,
            representation_model=representation_model
        )
        logger.error(f"Hugging Face Update Done")
        return updated_model, "Hugging Face (MiniLM)"
    except Exception as e:
        logger.error(f"Hugging Face update failed: {e}")
        return topic_model, "Basic BERTopic (no enhancement)"


def update_topics_with_openai(topic_model, comments, openai_api_key):
    try:
        logger.info("Updating topics with stable OpenAI model...")

        comments = clean_comments(comments)
        updated_model = deepcopy(topic_model)

        openai_rep = StableOpenAIRepresentation(
            api_key=openai_api_key,
            model="gpt-3.5-turbo",
            max_len=300,
            batch_size=8
        )

        updated_model.update_topics(
            comments,
            representation_model=openai_rep
        )

        return updated_model, "OpenAI"

    except Exception as e:
        logger.error(f"OpenAI update failed: {e}")
        logger.info("Falling back to Hugging Face model...")
        return update_topics_with_huggingface(topic_model, comments)


def update_topics_with_huggingface(topic_model, comments):
    """Update topic representations using a simpler Hugging Face model"""
    try:
        logger.info("Updating topics with Hugging Face...")
        updated_model = deepcopy(topic_model)

        from bertopic.representation import KeyBERTInspired

        representation_model = KeyBERTInspired()

        # Pass documents to update_topics
        updated_model.update_topics(
            comments,
            representation_model=representation_model
        )

        logger.info("Hugging Face update completed successfully")
        logger.info(f"Updated model has topics_: {hasattr(updated_model, 'topics_')}")
        return updated_model, "Hugging Face (KeyBERT)"

    except Exception as e:
        logger.error(f"Hugging Face update failed: {e}")
        logger.info("Falling back to basic BERTopic model")
        return topic_model, "Basic BERTopic (no enhancement)"


import openai

def generate_overall_summary(topics, openai_api_key, post_title):
    """Generate an overall summary of the topics using OpenAI"""
    try:
        logger.info("Entering generate_overall_summary function...")
        logger.debug(f"Received topics: {topics}")
        logger.debug(f"Received OpenAI API key: {'Provided' if openai_api_key else 'Not Provided'}")
        logger.debug(f"Received post title: {post_title}")

        if not openai_api_key:
            logger.warning("No OpenAI API key provided. Skipping summary generation.")
            return None

        logger.info("Formatting topics for the summary prompt...")
        topics_text = "\n".join([
            f"- {topic['label']} ({topic['percentage']}% of comments): {', '.join(topic['words'])}"
            for topic in topics[:5]
        ])
        logger.debug(f"Formatted topics for prompt:\n{topics_text}")

        prompt = f"""Please provide a concise summary of the following Reddit post and its main discussion topics.

Post Title: {post_title}

Main Discussion Topics:
{topics_text}

Summary:"""

        logger.info("Sending request to OpenAI API for summary generation...")
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that summarizes Reddit discussions."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.7
        )

        summary = response.choices[0].message['content'].strip()
        logger.info(f"Summary generated successfully. Length: {len(summary)} characters.")
        return summary
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return None





@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'BERTopic API is running'
    })


def send_progress_update(message, progress=None):
    """Helper function to format progress updates"""
    update = {
        'status': 'progress',
        'message': message,
        'progress': progress if progress is not None else 0
    }
    # Ensure we return a single JSON object per line
    return json.dumps(update) + '\n\n'


@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_reddit_post():
    """
    Main endpoint to analyze Reddit comments using BERTopic

    Expected JSON:
    {
        "comments": ["comment1", "comment2", ...],
        "openai_api_key": "sk-...",
        "post_title": "Optional post title"
    }
    """
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'status': 'preflight'})
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response

    # Parse request data first, outside the generator
    try:
        data = request.get_json()
        if not data:
            return Response(
                json.dumps({'status': 'error', 'error': 'No JSON data received'}),
                status=400,
                mimetype='application/json'
            )

        comments = data.get('comments', [])
        openai_api_key = data.get('openai_api_key')
        post_title = data.get('post_title', 'Reddit Post')

        if not comments:
            return Response(
                json.dumps({'status': 'error', 'error': 'No comments to analyze'}),
                status=400,
                mimetype='application/json'
            )

        def generate_analysis():
            try:
                yield send_progress_update('Loading models...', 10)
                topic_model, embedding_model = create_bertopic_model(openai_api_key)
                logger.info("Models loaded successfully")

                yield send_progress_update('Embedding comments...', 30)
                embeddings = embedding_model.encode(comments, show_progress_bar=False)
                logger.info(f"Embeddings created. Shape: {embeddings.shape}")

                yield send_progress_update('Analyzing topics...', 70)
                topics, probs = topic_model.fit_transform(comments, embeddings)
                logger.info(
                    f"Topic analysis complete. Topics shape: {np.array(topics).shape}, unique topics: {len(np.unique(topics))}")

                yield send_progress_update('Processing topic information...', 80)
                logger.info(f"Initial topics type: {type(topics)}, dtype: {getattr(topics, 'dtype', 'N/A')}")

                model_used = "None"
                if openai_api_key:
                    yield send_progress_update('Enhancing with OpenAI...', 85)
                    topic_model, model_used = update_topics_with_openai(topic_model, comments, openai_api_key)
                    logger.info(f"OpenAI enhancement complete. Model used: {model_used}")
                else:
                    yield send_progress_update('Enhancing with Hugging Face...', 85)
                    topic_model, model_used = update_topics_with_huggingface(topic_model, comments)
                    logger.info(f"Hugging Face enhancement complete. Model used: {model_used}")

                yield send_progress_update('Finalizing results...', 90)
                logger.info(f"Model has topics_ attribute: {hasattr(topic_model, 'topics_')}")

                if hasattr(topic_model, 'topics_') and topic_model.topics_ is not None:
                    topics_array = np.array(topic_model.topics_)
                    logger.info(f"Using model.topics_. Shape: {topics_array.shape}, dtype: {topics_array.dtype}")
                elif isinstance(topics, (list, np.ndarray)):
                    topics_array = np.array(topics) if isinstance(topics, list) else topics
                    logger.info(f"Using original topics. Shape: {topics_array.shape}, dtype: {topics_array.dtype}")
                else:
                    logger.error(
                        f"Unable to extract topics. topics type: {type(topics)}, topics_: {getattr(topic_model, 'topics_', 'N/A')}")
                    raise ValueError("Failed to extract valid topics array from model")

                logger.info(
                    f"Topics array validation - dtype: {topics_array.dtype}, ndim: {topics_array.ndim}, shape: {topics_array.shape}")

                if topics_array.dtype == bool or topics_array.ndim == 0:
                    logger.error(f"Invalid topics_array: dtype={topics_array.dtype}, shape={topics_array.shape}")
                    raise ValueError("Topics array has invalid dtype or shape")

                logger.info("Topics array validation passed")
                topic_info = topic_model.get_topic_info()
                logger.info(f"Retrieved topic info. Total topics: {len(topic_info)}")

                topics_list = []

                for idx, row in topic_info.iterrows():
                    topic_id = int(row['Topic'])
                    if topic_id == -1:
                        logger.debug(f"Skipping outlier topic (id: {topic_id})")
                        continue
                    words = row['Representation'][:5] if isinstance(row['Representation'], list) else []

                    try:
                        if isinstance(topics_array, np.ndarray) and topics_array.ndim > 0:
                            percentage = round((topics_array == topic_id).sum() / len(topics_array) * 100, 2)
                            logger.debug(f"Topic {topic_id}: calculated percentage {percentage}%")
                        else:
                            total_topics = len(topic_info) - 1
                            percentage = round(100 / total_topics, 2) if total_topics > 0 else 0
                            logger.debug(f"Topic {topic_id}: using equal distribution {percentage}%")
                    except Exception as e:
                        logger.warning(
                            f"Failed to calculate percentage for topic {topic_id}: {e}. Using equal distribution.")
                        total_topics = len(topic_info) - 1
                        percentage = round(100 / total_topics, 2) if total_topics > 0 else 0

                    topics_list.append({
                        'id': topic_id,
                        'label': ', '.join(words) if words else f'Topic {topic_id}',
                        'words': words,
                        'percentage': percentage
                    })

                logger.info(f"Topics list created with {len(topics_list)} topics")

                summary = None
                if openai_api_key:
                    yield send_progress_update('Generating summary...', 95)
                    summary = generate_overall_summary(topics_list, openai_api_key, post_title)
                    logger.info(f"Summary generated: {len(summary) if summary else 0} characters")

                yield send_progress_update('Complete', 100)
                logger.info("Analysis complete. Sending final result.")

                result = {
                    'status': 'complete',
                    'topics': topics_list,
                    'model_used': model_used,
                    'summary': summary,
                    'total_comments': len(comments)
                }
                yield json.dumps(result) + '\n\n'

            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                logger.error(f"Analysis error: {str(e)}\n{error_trace}")
                yield json.dumps({
                    'status': 'error',
                    'error': str(e),
                    'traceback': error_trace
                }) + '\n\n'

        # Set response headers for streaming
        return Response(generate_analysis(), mimetype='text/event-stream')

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Request processing error: {str(e)}\n{error_trace}")
        return Response(
            json.dumps({
                'status': 'error',
                'error': str(e),
                'traceback': error_trace
            }),
            status=500,
            mimetype='application/json'
        )


# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response


if __name__ == '__main__':
    # Pre-load models on startup
    logger.info("Starting BERTopic API server...")
    # Initialize models
    # get_embedding_model()
    app.run(host='0.0.0.0', port=5001, debug=True)