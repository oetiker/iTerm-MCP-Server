# ITerm MCP Server

A Model Context Protocol (MCP) server implementation for iTerm2 terminal integration. This server allows AI assistants to interact with iTerm2 terminals through the Model Context Protocol.

## Features

- Create and manage iTerm2 terminal sessions
- Execute commands in terminals
- Read terminal output
- List active terminals
- Close terminals

## Installation

```bash
npm install iterm_mcp
```

## Requirements

- Node.js >= 14.x
- iTerm2
- macOS (since iTerm2 is macOS-only)

## Usage

```javascript
import { startServer } from "iterm_mcp";

// Start the MCP server
startServer();
```

## Configuration

### Standard Configuration

The server uses the standard MCP configuration options. No additional configuration is required.

### Cursor Configuration

To use this server with Cursor, add the following configuration to your `~/.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "terminal": {
      "command": "node",
      "args": ["/path/to/your/TerminalMcp/index.js"]
    }
  }
}
```

Replace `/path/to/your/TerminalMcp/index.js` with the actual path to your `index.js` file.

## API Endpoints

The server implements the following MCP endpoints:

- `mcp_terminal_open_terminal`: Open a new terminal instance
- `mcp_terminal_execute_command`: Execute a command in a specific terminal
- `mcp_terminal_read_output`: Read the output from a specific terminal
- `mcp_terminal_close_terminal`: Close a specific terminal
- `mcp_terminal_list_terminals`: List all active terminals and their information

## Security Considerations

- The server validates all input using Zod schemas
- Commands are executed in isolated terminal sessions
- Proper error handling and input sanitization is implemented

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Author

Rishab Koul
