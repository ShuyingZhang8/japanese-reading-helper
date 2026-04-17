# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Pin to linux/amd64 so pip uses pre-built wheels for sudachipy (no Rust needed).
# ECS Fargate defaults to x86_64, so this is the correct target platform.
FROM --platform=linux/amd64 python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Install all dependencies into /install so we can copy them cleanly to the runtime stage
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

# Verify SudachiPy + sudachidict_core loaded correctly (fails fast if dict is missing)
RUN PYTHONPATH=/install/lib/python3.11/site-packages \
    python -c "import sudachipy; print('sudachipy ok')"

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM --platform=linux/amd64 python:3.11-slim

COPY --from=builder /install /usr/local

WORKDIR /app
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
