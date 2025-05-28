gcloud run deploy claude-memory-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/claude-memory/claude-memory-api:latest \
  --region REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars "ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY"