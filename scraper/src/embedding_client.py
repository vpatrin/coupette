from openai import OpenAI

# Must match EMBEDDING_MODEL_DIMENSIONS in core/db/models.py
_MODEL = "text-embedding-3-small"

# OpenAI batch limit: max 2048 texts per request.
# We use a smaller batch to keep memory and request size reasonable.
_BATCH_SIZE = 100


def create_embeddings(texts: list[str], *, api_key: str) -> list[list[float]]:
    """Encode a list of texts into embedding vectors via OpenAI API.

    Handles batching internally — caller can pass any number of texts.
    Returns vectors in the same order as input texts.
    """
    client = OpenAI(api_key=api_key)
    all_vectors: list[list[float]] = []

    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        response = client.embeddings.create(model=_MODEL, input=batch)
        # Response data is ordered by index, but sort to be safe
        sorted_data = sorted(response.data, key=lambda d: d.index)
        all_vectors.extend([d.embedding for d in sorted_data])

    return all_vectors
