from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import numpy as np
import openai
from sentence_transformers import SentenceTransformer
from umap import UMAP
from hdbscan import HDBSCAN
from bertopic import BERTopic
from bertopic.representation import OpenAI as BertopicOpenAI
import logging
from copy import deepcopy
from transformers import pipeline, AutoModelForCausalLM, AutoTokenizer
import torch
import json
import sys

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


def create_bertopic_model(openai_api_key=None):
    """
    Create and return a BERTopic model with optional OpenAI representation
    Returns: tuple of (topic_model, embedding_model)
    """
    # Step 1: Create embedding model
    embedding_model = get_embedding_model()

    # Step 2: Reduce dimensionality
    umap_model = UMAP(n_neighbors=15, n_components=5, min_dist=0.0, metric='cosine', random_state=42)

    # Step 3: Cluster reduced embeddings
    hdbscan_model = HDBSCAN(min_cluster_size=10, metric='euclidean',
                            cluster_selection_method='eom', prediction_data=True)

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


def update_topics_with_openai(topic_model, comments, openai_api_key):
    """Update topic representations using OpenAI"""
    try:
        logger.info("Updating topics with OpenAI...")
        # Create a copy to avoid modifying the original model
        updated_model = deepcopy(topic_model)

        # Define OpenAI representation model
        openai_model = BertopicOpenAI(
            model="gpt-3.5-turbo",
            delay_in_seconds=2,
            chat=True,
            nr_docs=5,
            doc_length=100,
            openai_api_key=openai_api_key
        )

        # Update model with OpenAI representation
        updated_model.update_topics(
            comments,
            representation_model=openai_model
        )
        return updated_model, "OpenAI"
    except Exception as e:
        logger.error(f"OpenAI update failed: {e}")
        return topic_model, "Hugging Face (OpenAI failed)"


def update_topics_with_huggingface(topic_model, comments):
    """Update topic representations using Hugging Face model"""
    try:
        logger.info("Updating topics with Hugging Face...")
        # Create a copy to avoid modifying the original model
        updated_model = deepcopy(topic_model)

        # Use a pre-trained model for representation
        representation_model = {
            "model": "all-MiniLM-L6-v2",
            "exponent_scale": 0.9,
            "word_length": 15
        }

        # Update model with Hugging Face representation
        updated_model.update_topics(
            comments,
            representation_model=representation_model
        )
        return updated_model, "Hugging Face"
    except Exception as e:
        logger.error(f"Hugging Face update failed: {e}")
        return topic_model, "Basic BERTopic (no enhancement)"


def generate_overall_summary(topics, openai_api_key, post_title):
    """Generate an overall summary of the topics using OpenAI"""
    try:
        if not openai_api_key:
            return None

        # Format topics for the prompt
        topics_text = "\n".join([
            f"- {topic['label']} ({topic['percentage']}% of comments): {', '.join(topic['words'])}"
            for topic in topics[:5]  # Limit to top 5 topics
        ])

        prompt = f"""Please provide a concise summary of the following Reddit post and its main discussion topics.

Post Title: {post_title}

Main Discussion Topics:
{topics_text}

Summary:"""

        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that summarizes Reddit discussions."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.7,
            api_key=openai_api_key
        )

        return response.choices[0].message['content'].strip()
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
                # If less than 10 comments, we'll still proceed but with a warning
                if len(comments) < 10:
                    yield send_progress_update('Warning: Fewer than 10 comments may result in less accurate analysis',
                                               20)

                # Step 1: Create BERTopic model
                yield send_progress_update('Initializing BERTopic model...', 30)
                topic_model, embedding_model = create_bertopic_model(openai_api_key)

                # Step 2: Generate embeddings
                yield send_progress_update('Generating embeddings...', 50)
                embeddings = embedding_model.encode(comments, show_progress_bar=False)

                # Step 3: Fit BERTopic model
                yield send_progress_update('Analyzing topics...', 70)
                topics, probs = topic_model.fit_transform(comments, embeddings)

                # Step 4: Get topic information
                yield send_progress_update('Processing topic information...', 80)
                topic_info = topic_model.get_topic_info()
                num_topics = len(topic_info[topic_info.Topic != -1])

                # Step 5: Update with OpenAI or Hugging Face
                model_used = "None"
                if openai_api_key:
                    yield send_progress_update('Enhancing topics with OpenAI...', 85)
                    topic_model, model_used = update_topics_with_openai(
                        topic_model,
                        comments,
                        openai_api_key
                    )
                else:
                    yield send_progress_update('Enhancing topics with Hugging Face...', 85)
                    topic_model, model_used = update_topics_with_huggingface(topic_model, comments)

                # Step 6: Extract topic information
                yield send_progress_update('Finalizing results...', 90)
                topics_list = []
                topic_info = topic_model.get_topic_info()

                for idx, row in topic_info.iterrows():
                    if row['Topic'] != -1:  # Skip outlier topic
                        topic_id = row['Topic']
                        topic_words = topic_model.get_topic(topic_id)

                        # Get top 5 words
                        words = [word for word, score in topic_words[:5]]
                        scores = [float(score) for word, score in topic_words[:5]]

                        # Get representation (OpenAI label if available)
                        representation = row.get('Representation', words)
                        if isinstance(representation, list) and len(representation) > 0:
                            label = representation[0]
                        else:
                            label = ' | '.join(words[:3])

                        topics_list.append({
                            'id': int(topic_id),
                            'label': label,
                            'words': words,
                            'scores': scores,
                            'count': int(row['Count']),
                            'percentage': round(row['Count'] / len(comments) * 100, 1) if comments else 0
                        })

                # Step 7: Generate overall summary using OpenAI
                summary = None
                openai_enhanced = model_used == "OpenAI"
                if openai_api_key and openai_enhanced:
                    try:
                        yield send_progress_update('Generating summary...', 95)
                        summary = generate_overall_summary(topics_list, openai_api_key, post_title)
                    except Exception as e:
                        logger.warning(f"Summary generation failed: {e}")
                        yield send_progress_update('Summary generation skipped', 95)

                # Step 8: Return results
                result = {
                    'status': 'success',
                    'data': {
                        'num_topics': num_topics,
                        'num_comments': len(comments),
                        'topics': topics_list,
                        'summary': summary,
                        'model_used': model_used,
                        'openai_enhanced': openai_enhanced,
                        'post_title': post_title,
                        'note': 'Using Hugging Face model as fallback' if 'Hugging Face' in model_used else ''
                    }
                }
                # Ensure final result is properly formatted with double newlines
                yield json.dumps(result) + '\n\n'

            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                logger.error(f"Analysis error: {str(e)}\n{error_trace}")
                # Ensure error is properly formatted with double newlines
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
    get_embedding_model()
    app.run(host='0.0.0.0', port=5001, debug=True)