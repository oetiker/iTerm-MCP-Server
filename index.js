#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

// Store active terminals with their iTerm window and tab IDs
const terminals = new Map();
let terminalCounter = 0;

// Helper function to escape strings for AppleScript
function escapeForAppleScript(str) {
  // In AppleScript, within double-quoted strings:
  // - Backslash: \ becomes \\
  // - Double quote: " becomes \"
  // Since we're using a here-doc (<<'EOF'), no shell escaping is needed
  return str
    .replace(/\\/g, '\\\\')    // Each \ becomes \\
    .replace(/"/g, '\\"');      // Each " becomes \"
}

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
  
  // Create iTerm window/tab and get its IDs with focus restoration
  const script = `
    -- Store the current frontmost application and window
    tell application "System Events"
      set originalApp to name of first application process whose frontmost is true
    end tell
    
    -- If the original app is iTerm, save the current window
    if originalApp is "iTerm2" then
      tell application "iTerm2"
        if (count of windows) > 0 then
          set originalWindow to current window
          set originalWindowId to id of originalWindow
        end if
      end tell
    end if
    
    -- Create new window
    tell application "iTerm2"
      set newWindow to (create window with default profile)
      
      tell newWindow
        -- For a new window, the tab index is always 1
        set tabIndex to 1
        
        -- Get the session and write initial text
        tell current session of current tab
          write text "echo 'Terminal ${terminalId} ready'"
          set sessionId to id
        end tell
        
        -- Store the return value
        set returnValue to (id of newWindow as string) & "|" & tabIndex & "|" & sessionId
      end tell
    end tell
    
    -- Restore focus to the original application/window
    if originalApp is "iTerm2" then
      tell application "iTerm2"
        if (count of windows) > 0 then
          -- Find and focus the original window
          repeat with w in windows
            if id of w is originalWindowId then
              select w
              exit repeat
            end if
          end repeat
        end if
      end tell
    else
      tell application originalApp to activate
    end if
    
    return returnValue
  `;
  
  try {
    const result = await executeITermScript(script);
    const [windowId, tabIndex, sessionId] = result.split("|");
    
    terminals.set(terminalId, {
      windowId: windowId,
      tabIndex: parseInt(tabIndex),
      sessionId: sessionId,
      id: terminalId,
      output: []
    });
    
    return {
      content: [
        {
          type: "text",
          text: `Terminal opened with ID: ${terminalId} (window: ${windowId}, tab: ${tabIndex})`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to open terminal: ${error.message}`,
        },
      ],
    };
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
    
    // Escape the command for AppleScript
    const escapedCommand = escapeForAppleScript(command);
    
    // Execute command in the specific window/tab using window ID
    const script = `
      tell application "iTerm2"
        -- Find the window by ID
        repeat with aWindow in windows
          if (id of aWindow as string) = "${terminal.windowId}" then
            tell aWindow
              -- Find the tab by index
              if (count of tabs) >= ${terminal.tabIndex} then
                tell tab ${terminal.tabIndex}
                  tell current session
                    write text "${escapedCommand}"
                    return "Command executed"
                  end tell
                end tell
              else
                return "Tab not found"
              end if
            end tell
            return "Command executed"
          end if
        end repeat
        return "Window not found"
      end tell
    `;
    
    try {
      const result = await executeITermScript(script);
      
      if (result === "Window not found" || result === "Tab not found") {
        return {
          content: [
            {
              type: "text",
              text: `Terminal ${terminalId} session not found in iTerm`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Command executed in ${terminalId}: ${command}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to execute command: ${error.message}`,
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
    lines: z.number().optional().describe("Number of lines to read (default: all)"),
  },
  async ({ terminalId, lines }) => {
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
    
    // Get the contents of the specific session
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${terminal.windowId}" then
            tell aWindow
              if (count of tabs) >= ${terminal.tabIndex} then
                tell tab ${terminal.tabIndex}
                  tell current session
                    set output to contents
                    ${lines ? `
                    -- Get only last N lines
                    set outputLines to paragraphs of output
                    set lineCount to count of outputLines
                    if lineCount > ${lines} then
                      set startLine to lineCount - ${lines} + 1
                      set output to items startLine thru lineCount of outputLines
                      set AppleScript's text item delimiters to linefeed
                      set output to output as string
                      set AppleScript's text item delimiters to ""
                    end if
                    ` : ''}
                    return output
                  end tell
                end tell
              else
                return "Tab not found"
              end if
            end tell
            exit repeat
          end if
        end repeat
      end tell
      return "Window not found"
    `;
    
    try {
      const output = await executeITermScript(script);
      
      if (output === "Window not found" || output === "Tab not found") {
        return {
          content: [
            {
              type: "text",
              text: `Terminal ${terminalId} not found in iTerm`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: output || "No output available",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to read output: ${error.message}`,
          },
        ],
      };
    }
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
    
    // Close the specific window (since we create one window per terminal)
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${terminal.windowId}" then
            close aWindow
            return "Closed"
          end if
        end repeat
      end tell
      return "Window not found"
    `;
    
    try {
      const result = await executeITermScript(script);
      
      if (result === "Window not found") {
        // Still remove from our tracking even if not found in iTerm
        terminals.delete(terminalId);
        return {
          content: [
            {
              type: "text",
              text: `Terminal ${terminalId} was not found in iTerm but removed from tracking`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Failed to close iTerm window:", error);
    }
    
    terminals.delete(terminalId);
    
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
    const activeTerminals = Array.from(terminals.entries()).map(([id, term]) => 
      `${id} (window: ${term.windowId}, tab: ${term.tabIndex})`
    );
    const count = terminals.size;
    
    // Also check what's actually open in iTerm
    const script = `
      tell application "iTerm2"
        set windowCount to count of windows
        set totalTabs to 0
        repeat with aWindow in windows
          set totalTabs to totalTabs + (count of tabs of aWindow)
        end repeat
        return "Windows: " & windowCount & ", Total tabs: " & totalTabs
      end tell
    `;
    
    let iTermStatus = "";
    try {
      iTermStatus = await executeITermScript(script);
    } catch (error) {
      iTermStatus = "Could not get iTerm status";
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Number of tracked terminals: ${count}
iTerm status: ${iTermStatus}
Tracked terminals:
${activeTerminals.join("\n") || "None"}`,
        },
      ],
    };
  }
);

server.tool(
  "clear-terminal",
  "Clear the output of a specific terminal",
  {
    terminalId: z.string().describe("ID of the terminal to clear"),
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
    
    // Clear the terminal screen
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${terminal.windowId}" then
            tell aWindow
              if (count of tabs) >= ${terminal.tabIndex} then
                tell tab ${terminal.tabIndex}
                  tell current session
                    write text "clear"
                    return "Cleared"
                  end tell
                end tell
              else
                return "Tab not found"
              end if
            end tell
            exit repeat
          end if
        end repeat
      end tell
      return "Window not found"
    `;
    
    try {
      const result = await executeITermScript(script);
      
      if (result === "Window not found" || result === "Tab not found") {
        return {
          content: [
            {
              type: "text",
              text: `Terminal ${terminalId} not found in iTerm`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Terminal ${terminalId} cleared`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to clear terminal: ${error.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iTerm2 MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});