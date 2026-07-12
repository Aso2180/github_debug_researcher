FROM python:3.12-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY src ./src
COPY scripts ./scripts
RUN pip install --no-cache-dir .
ENTRYPOINT ["python", "-m", "src.main"]
