#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";

// Store active terminals
const terminals = new Map();
let terminalCounter = 0;

// Helper function to execute AppleScript for iTerm
async function executeITermScript(script) {
  const execPromise = promisify(exec);
  
  try {
    // Use osascript with here-doc for better handling of complex scripts
    // This avoids issues with quotes and special characters in AppleScript
    const { stdout, stderr } = await execPromise(`osascript <<'EOF'
${script}
EOF`);
    
    if (stderr) {
      console.error("iTerm AppleScript warning:", stderr);
    }
    
    return stdout.trim();
  } catch (error) {
    console.error("iTerm AppleScript error:", error);
    throw error;
  }
}

// Create server instance
const server = new McpServer({
  name: "terminal",
  version: "1.0.0",
});

// Register terminal tools
server.tool("open-terminal", "Open a new terminal instance", {}, async () => {
  const terminalId = `terminal-${terminalCounter++}`;

  // Create both GUI terminal and background process for output collection
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const terminal = spawn(shell, [], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  const output = [];

  terminal.stdout.on("data", (data) => {
    output.push(data.toString());
  });

  terminal.stderr.on("data", (data) => {
    output.push(data.toString());
  });

  // Create iTerm window
  const script = `
    tell application "iTerm2"
      activate
      tell current window
        create tab with default profile
        tell current session
          write text "echo Terminal ${terminalId} ready"
        end tell
      end tell
    end tell
  `;

  try {
    await executeITermScript(script);
    terminals.set(terminalId, {
      process: terminal,
      output,
      id: terminalId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Terminal opened with ID: ${terminalId}`,
        },
      ],
    };
  } catch (error) {
    terminal.kill(); // Clean up background process if iTerm fails
    throw error;
  }
});

server.tool(
  "execute-command",
  "Execute a command in a specific terminal",
  {
    terminalId: z.string().describe("ID of the terminal to execute command in"),
    command: z.string().describe("Command to execute"),
  },
  async ({ terminalId, command }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) {
      return {
        content: [
          {
            type: "text",
            text: `Terminal ${terminalId} not found`,
          },
        ],
      };
    }

    // Execute in both GUI and background process
    terminal.process.stdin.write(command + "\n");

    const script = `
      tell application "iTerm2"
        tell current session of current window
          write text "${command.replace(/"/g, '\\"')}"
        end tell
      end tell
    `;

    try {
      await executeITermScript(script);
      // Give some time for the command to execute and output to be collected
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        content: [
          {
            type: "text",
            text: `Command executed in ${terminalId}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to execute in GUI terminal but command ran in background: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "read-output",
  "Read the output from a specific terminal",
  {
    terminalId: z.string().describe("ID of the terminal to read output from"),
  },
  async ({ terminalId }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) {
      return {
        content: [
          {
            type: "text",
            text: `Terminal ${terminalId} not found`,
          },
        ],
      };
    }

    const output = terminal.output.join("");
    terminal.output.length = 0; // Clear the output buffer

    return {
      content: [
        {
          type: "text",
          text: output || "No output available",
        },
      ],
    };
  }
);

server.tool(
  "close-terminal",
  "Close a specific terminal",
  {
    terminalId: z.string().describe("ID of the terminal to close"),
  },
  async ({ terminalId }) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) {
      return {
        content: [
          {
            type: "text",
            text: `Terminal ${terminalId} not found`,
          },
        ],
      };
    }

    // Close both GUI and background process
    terminal.process.kill();

    const script = `
      tell application "iTerm2"
        close current window
      end tell
    `;

    try {
      await executeITermScript(script);
    } catch (error) {
      console.error("Failed to close iTerm window:", error);
    }

    terminals.delete(terminalId);

    // Safely decrement the terminal counter
    terminalCounter = Math.max(0, terminalCounter - 1);

    return {
      content: [
        {
          type: "text",
          text: `Terminal ${terminalId} closed`,
        },
      ],
    };
  }
);

server.tool(
  "list-terminals",
  "List all active terminals and their information",
  {},
  async () => {
    const activeTerminals = Array.from(terminals.entries()).map(([id]) => id);
    const count = terminals.size;

    return {
      content: [
        {
          type: "text",
          text: `Number of active terminals: ${count}\nActive terminal IDs: ${
            activeTerminals.join(", ") || "None"
          }`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Terminal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
