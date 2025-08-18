# iTerm MCP Server

A Model Context Protocol (MCP) server implementation for iTerm2 terminal integration. This server allows AI assistants to interact with iTerm2 terminals programmatically through the Model Context Protocol.

## Features

- Create and manage iTerm2 terminal sessions
- Execute commands in specific terminals
- Read terminal output
- Clear terminal screens
- List and track active terminals
- Proper command escaping for security

## Requirements

- Node.js >= 14.x
- iTerm2 (latest version recommended)
- macOS (iTerm2 is macOS-only)

## Installation

### Via npm (recommended)
```bash
npm install -g iterm-mcp-server
```

### From source
```bash
git clone https://github.com/rishabkoul/iTerm-MCP-Server.git
cd iTerm-MCP-Server
npm install
npm link
```

## Configuration

### Claude Code Configuration

The easiest way to add this server to Claude Code:

```bash
claude mcp add iterm-mcp-server npx iterm-mcp-server
```

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iterm": {
      "command": "npx",
      "args": ["iterm-mcp-server"]
    }
  }
}
```

### Cursor Configuration

For Cursor IDE, add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "terminal": {
      "command": "npx",
      "args": ["iterm-mcp-server"]
    }
  }
}
```

## Available Tools

### `open-terminal`
Opens a new iTerm2 terminal window.

**Returns**: Terminal ID for subsequent operations

**Example Response**:
```json
{
  "terminalId": "terminal-0"
}
```

### `execute-command`
Executes a command in a specific terminal.

**Parameters**:
- `terminalId` (string, required): ID of the terminal
- `command` (string, required): Command to execute

**Example**:
```json
{
  "terminalId": "terminal-0",
  "command": "echo 'Hello, World!'"
}
```

### `read-output`
Reads the output from a specific terminal.

**Parameters**:
- `terminalId` (string, required): ID of the terminal
- `lines` (number, optional): Number of lines to read

**Example**:
```json
{
  "terminalId": "terminal-0",
  "lines": 10
}
```

### `clear-terminal`
Clears the terminal screen and output buffer.

**Parameters**:
- `terminalId` (string, required): ID of the terminal

### `close-terminal`
Closes a specific terminal window.

**Parameters**:
- `terminalId` (string, required): ID of the terminal

### `list-terminals`
Lists all active terminals and their information.

**Returns**: List of active terminal IDs and iTerm status

## Usage Example

Here's how an AI assistant might use these tools:

```javascript
// Open a new terminal
const terminal = await use_mcp_tool("iterm", "open-terminal");
// Returns: { terminalId: "terminal-0" }

// Execute a command
await use_mcp_tool("iterm", "execute-command", {
  terminalId: "terminal-0",
  command: "ls -la"
});

// Read the output
const output = await use_mcp_tool("iterm", "read-output", {
  terminalId: "terminal-0"
});

// Clear the terminal
await use_mcp_tool("iterm", "clear-terminal", {
  terminalId: "terminal-0"
});

// Close when done
await use_mcp_tool("iterm", "close-terminal", {
  terminalId: "terminal-0"
});
```

## Troubleshooting

### Common Issues

1. **iTerm2 not responding**: Ensure iTerm2 is installed and accessible. The server uses AppleScript to control iTerm2.

2. **Permission denied errors**: macOS may require permissions for terminal automation. Check System Preferences > Security & Privacy > Privacy > Automation.

3. **Commands not executing**: Verify the terminal ID is correct using `list-terminals`.

### Debug Mode

To run with debug output:
```bash
DEBUG=* npx iterm-mcp-server
```

## Security Considerations

- Input validation using Zod schemas
- Proper command escaping for AppleScript
- Isolated terminal sessions
- No direct shell execution without terminal context

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and upcoming features.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Make your changes
5. Test locally: `npm link` then configure your MCP client
6. Submit a pull request

### Running Tests

```bash
npm test
```

## License

ISC

## Author

Rishab Koul
Tobi Oetiker

## Acknowledgments

- Built for the [Model Context Protocol](https://modelcontextprotocol.io/)
- Designed for [Claude Desktop](https://claude.ai) and other MCP-compatible clients
