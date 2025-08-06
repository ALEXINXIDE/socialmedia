# Use Python 3.11 slim image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Create downloads directory
RUN mkdir -p /tmp/social_downloader

# Expose port
EXPOSE 8080

# Set environment variables
ENV FLASK_APP=src/main.py
ENV FLASK_ENV=production
ENV PORT=8080

# Run the application
CMD ["python", "src/main.py"]

