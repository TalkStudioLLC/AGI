# Claude Memory API

A cloud-deployed memory system for Claude AI using Google Cloud Run and Docker.

## Features

- **Persistent Memory**: SQLite database with Cloud Storage volume mount
- **Memory Operations**: Remember, recall, reflect, and reason
- **REST API**: Full HTTP API for memory operations
- **Cloud Native**: Deployed on Google Cloud Run with Artifact Registry
- **PowerShell Scripts**: Complete deployment automation

## Quick Start

1. **Setup Environment**
   ```powershell
   cd scripts
   .\setup.ps1
   ```

2. **Deploy to Cloud**
   ```powershell
   .\deploy.ps1 -AnthropicApiKey "your-anthropic-key"
   ```

3. **Test Deployment**
   ```powershell
   .\test-api.ps1
   ```

## API Endpoints

- `POST /api/chat` - Chat with memory context
- `GET /api/memories` - List stored memories
- `POST /api/remember` - Store new memory
- `POST /api/reflect` - Perform reflection
- `GET /api/stats` - Memory statistics
- `GET /health` - Health check

## Architecture

- **Database**: SQLite with Cloud Storage persistence
- **Registry**: `us-eastx-docker.pkg.dev/x/claude-memory`
- **Region**: `us-east4`
- **Runtime**: Node.js 20 Alpine

## Scripts

| Script | Purpose |
|--------|---------|
| `setup.ps1` | Initial environment setup |
| `deploy.ps1` | Main deployment script |
| `test-api.ps1` | API testing |
| `logs.ps1` | View service logs |
| `status.ps1` | Check deployment status |
| `cleanup.ps1` | Remove all resources |

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `PROJECT_ID` - Google Cloud project ID
- `REGION` - Deployment region

## Development

Local development:
```bash
npm install
npm run dev
```

Docker build:
```bash
docker build -t claude-memory-api .
docker run -p 8080:8080 claude-memory-api
```
