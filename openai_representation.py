import openai
import numpy as np
from typing import List
import logging

logger = logging.getLogger(__name__)


class StableOpenAIRepresentation:
    def __init__(
            self,
            api_key: str,
            model: str = "gpt-3.5-turbo",
            embedding_model: str = "text-embedding-ada-002",
            max_len: int = 400,
            batch_size: int = 5,
            **kwargs
    ):
        logger.info(f"Initializing StableOpenAIRepresentation - model: {model}")

        # Extract and log unexpected kwargs
        if kwargs:
            logger.warning(f"Ignoring unexpected kwargs: {list(kwargs.keys())}")

        try:
            # Set the OpenAI API key
            openai.api_key = api_key
            logger.info("OpenAI API key set successfully")
        except Exception as e:
            logger.error(f"Failed to set OpenAI API key: {e}")
            raise

        self.model = model
        self.embedding_model = embedding_model
        self.max_len = max_len
        self.batch_size = batch_size

    def _clean(self, text: str) -> str:
        if not isinstance(text, str):
            return "empty document"
        text = text.strip()
        if len(text) == 0:
            return "empty document"
        if len(text) > self.max_len:
            return text[:self.max_len]
        if len(text) < 10:
            return text + " " + text
        return text

    def embed_documents(self, documents: List[str]) -> np.ndarray:
        logger.info(f"Embedding {len(documents)} documents")
        cleaned_docs = [self._clean(d) for d in documents]
        embeddings = []

        for i in range(0, len(cleaned_docs), self.batch_size):
            batch = cleaned_docs[i:i + self.batch_size]
            logger.debug(f"Processing embedding batch {i // self.batch_size + 1}")
            try:
                response = openai.Embedding.create(
                    model=self.embedding_model,
                    input=batch
                )
                for item in response['data']:
                    embeddings.append(item['embedding'])
            except Exception as e:
                logger.error(f"Failed to create embeddings: {e}")
                raise

        logger.info(f"Embeddings created successfully: {len(embeddings)} vectors")
        return np.array(embeddings)

    def __call__(self, docs: List[str]) -> List[str]:
        logger.info(f"Generating topic representation from {len(docs)} documents")
        cleaned_docs = [self._clean(d) for d in docs]
        joined_text = "\n".join(cleaned_docs)

        prompt = (
            "Summarize the core theme of these documents to create a short topic label: "
            f"\n{joined_text}\n"
        )

        try:
            response = openai.ChatCompletion.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}]
            )
            label = response['choices'][0]['message']['content'].strip()
            logger.info(f"Topic label generated: {label}")
            return [label]
        except Exception as e:
            logger.error(f"Failed to generate topic representation: {e}")
            raise
