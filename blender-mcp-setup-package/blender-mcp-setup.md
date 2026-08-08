# Blender MCP Setup Guide

## Repository Information
- **Repository URL**: git@github.com:ahujasid/blender-mcp.git
- **Purpose**: Model Context Protocol server for Blender integration

## Setup Steps

### 1. Clone the Repository
```bash
cd C:\Users\Tom\Documents\GitHub
git clone git@github.com:ahujasid/blender-mcp.git
```

### 2. Navigate to the Repository
```bash
cd blender-mcp
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configuration
The Blender MCP server will be added to your Claude desktop configuration automatically using the configuration below.

## Claude Desktop Configuration Addition

Add this to your `claude_desktop_config.json` in the `mcpServers` section:

```json
"blender-mcp": {
  "command": "node",
  "args": [
    "C:\\Users\\Tom\\Documents\\GitHub\\blender-mcp\\index.js"
  ],
  "env": {},
  "description": "Blender MCP server for 3D modeling and animation automation"
}
```

## Usage
Once configured, you'll be able to use Claude to:
- Control Blender operations
- Automate 3D modeling tasks
- Create and modify Blender scenes
- Execute Blender Python scripts

## Troubleshooting
- Ensure Blender is installed and accessible from command line
- Check that all npm dependencies are installed
- Verify the path to the Blender MCP server is correct
