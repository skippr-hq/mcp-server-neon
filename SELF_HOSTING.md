# Self-Hosting the Neon MCP Server

## Overview

This repository contains a fork of the Model Context Protocol (MCP) server designed specifically for Neon. This version simplifies the authentication flow by using a direct API key in the authorization header instead of the standard OAuth user flow.

You can integrate this MCP server directly with AI agents via API/SDK, allowing your agents to execute operations through Neon's infrastructure.

## Getting Started

### Installation

Clone this repository and install dependencies:

```bash
git clone https://github.com/skippr-hq/mcp-server-neon.git
cd mcp-server-neon
npm install
```

### Building

Build the server locally:

```bash
npm run build
```

### Running

Start the server:

```bash
node dist/index.js start:sse
```

## Docker Deployment

A simplified Docker setup is available for easy deployment:

### Building the Docker Image

```bash
docker build -t neon-mcp-server -f Dockerfile.simple .
```

### Running the Docker Container

```bash
docker run -p 3001:3001 -e PORT=3001 neon-mcp-server
```

The server will be available at http://localhost:3001

## Authentication

This fork uses a simplified authentication method:
- Provide your Neon API key directly as a Bearer token in the Authorization header
- Example: `Authorization: Bearer your-neon-api-key`

## Testing

You can test your local or remote server using the MCP inspector tool:

```bash
npx @modelcontextprotocol/inspector
```

## SDK Integration Example

Here's a simplified example of integrating with an AI agent using Python:

```python
import os
from mcp import ClientSession
from mcp.client.sse import sse_client

class NeonMCPClient:
    def __init__(self):
        self.session = None
        self._neon_api_key = os.environ["NEON_API_KEY"]
        
    async def connect(self):
        # Connect to MCP server using SSE client
        streams_context = sse_client(
            os.environ["NEON_MCP_SERVER_URL"],
            headers={"Authorization": f"Bearer {self._neon_api_key}"}
        )
        streams = await streams_context.__aenter__()
        session_context = ClientSession(*streams)
        self.session = await session_context.__aenter__()
        await self.session.initialize()
        
    async def get_available_tools(self):
        # Get available tools
        if not self.session:
            await self.connect()
        tools_response = await self.session.list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema
            }
            for tool in tools_response.tools
        ]
        
    async def execute_tool(self, tool_name, arguments):
        # Execute SQL tool on Neon
        result = await self.session.call_tool(tool_name, arguments)
        return result
```

Usage with an agent:

```python
# Initialize client and get tools
neon_client = NeonMCPClient()
neon_tools = await client.get_available_tools()

# Include tools in agent request
response = await agent.create_message(
    model="claude-3-7-sonnet",
    tools=neon_tools,
    # other parameters...
)

# Execute any tool calls made by the agent
if tool_call := response.tool_calls[0]:
    result = await neon_client.execute_tool(tool_call.name, tool_call.input)
```


