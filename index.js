#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

// No longer tracking terminals - we parse IDs directly

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
server.tool(
  "open-terminal", 
  "Opens a new iTerm2 window and creates a tracked terminal session. Returns a terminal ID that can be used with other commands. The terminal will be ready to receive commands immediately.",
  {}, 
  async () => {
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
        
        -- Get the session ID (no need to write anything)
        tell current session of current tab
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
    else if originalApp is "Electron" then
      -- Handle VS Code (Electron-based app)
      try
        tell application "Visual Studio Code" to activate
      on error
        try
          tell application "Code" to activate
        on error
          -- If VS Code is not found, try to restore by process
          tell application "System Events"
            set frontmost of first application process whose name is "Electron" to true
          end tell
        end try
      end try
    else
      -- For other apps, activate normally
      try
        tell application originalApp to activate
      on error
        -- If activation fails, ignore and continue
      end try
    end if
    
    return returnValue
  `;
  
  try {
    const result = await executeITermScript(script);
    const [windowId, tabIndex, sessionId] = result.split("|");
    
    // Generate the terminal ID based on window and tab
    const terminalId = `iterm-${windowId}-${tabIndex}`;
    
    return {
      content: [
        {
          type: "text",
          text: `Terminal opened with ID: ${terminalId}`,
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
  "Executes a shell command in the specified terminal as if typed by the user. The command is sent with a newline, so it will be executed immediately. Use this for running programs, changing directories, or any shell command.",
  {
    terminalId: z.string().describe("The terminal ID returned from open-terminal or list-terminals"),
    command: z.string().describe("Shell command to execute (e.g., 'ls -la', 'cd /path', 'npm start'). Will be executed with Enter key automatically."),
  },
  async ({ terminalId, command }) => {
    // Parse the terminal ID to get window and tab
    const match = terminalId.match(/^iterm-(\d+)-(\d+)$/);
    if (!match) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid terminal ID format: ${terminalId}`,
          },
        ],
      };
    }
    
    const windowId = match[1];
    const tabIndex = parseInt(match[2]);
    
    // Escape the command for AppleScript
    const escapedCommand = escapeForAppleScript(command);
    
    // Execute command in the specific window/tab using window ID
    const script = `
      tell application "iTerm2"
        -- Find the window by ID
        repeat with aWindow in windows
          if (id of aWindow as string) = "${windowId}" then
            tell aWindow
              -- Find the tab by index
              if (count of tabs) >= ${tabIndex} then
                tell tab ${tabIndex}
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
  "Reads the current visible output from a terminal session. This captures what's currently displayed in the terminal window, including command output, prompts, and any TUI interfaces. Useful for checking command results or TUI state.",
  {
    terminalId: z.string().describe("The terminal ID to read from"),
    lines: z.number().optional().describe("Number of lines to read from the bottom of the output. If omitted, returns all visible content. Useful for getting just recent output."),
  },
  async ({ terminalId, lines }) => {
    // Parse the terminal ID to get window and tab
    const match = terminalId.match(/^iterm-(\d+)-(\d+)$/);
    if (!match) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid terminal ID format: ${terminalId}`,
          },
        ],
      };
    }
    
    const windowId = match[1];
    const tabIndex = parseInt(match[2]);
    
    // Get the contents of the specific session
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${windowId}" then
            tell aWindow
              if (count of tabs) >= ${tabIndex} then
                tell tab ${tabIndex}
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
  "Closes the iTerm2 window associated with the specified terminal ID. This will terminate any running processes in that terminal. The terminal ID will be removed from tracking after closing.",
  {
    terminalId: z.string().describe("The terminal ID to close. This will close the entire iTerm2 window."),
  },
  async ({ terminalId }) => {
    // Parse the terminal ID to get window and tab
    const match = terminalId.match(/^iterm-(\d+)-(\d+)$/);
    if (!match) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid terminal ID format: ${terminalId}`,
          },
        ],
      };
    }
    
    const windowId = match[1];
    const tabIndex = parseInt(match[2]);
    
    // Close the specific window (since we create one window per terminal)
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${windowId}" then
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
        return {
          content: [
            {
              type: "text",
              text: `Terminal ${terminalId} was not found in iTerm`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Failed to close iTerm window:", error);
    }
    
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
  "Lists all currently tracked terminal sessions with their IDs and iTerm2 window/tab information. Also shows the actual number of iTerm2 windows and tabs open. Useful for finding available terminals or debugging connection issues.",
  {},
  async () => {
    // Get all open iTerm windows and tabs
    const script = `
      tell application "iTerm2"
        set windowCount to count of windows
        set totalTabs to 0
        set windowList to ""
        repeat with aWindow in windows
          set windowId to id of aWindow as string
          set tabCount to count of tabs of aWindow
          set totalTabs to totalTabs + tabCount
          repeat with tabIndex from 1 to tabCount
            if windowList is not "" then
              set windowList to windowList & "\n"
            end if
            set windowList to windowList & "iterm-" & windowId & "-" & tabIndex
          end repeat
        end repeat
        return "Windows: " & windowCount & ", Total tabs: " & totalTabs & "\n" & windowList
      end tell
    `;
    
    let result = "";
    try {
      result = await executeITermScript(script);
    } catch (error) {
      result = "Could not get iTerm status";
    }
    
    return {
      content: [
        {
          type: "text",
          text: `iTerm status and terminal IDs:
${result}`,
        },
      ],
    };
  }
);

server.tool(
  "clear-terminal",
  "Clears the terminal screen by sending the 'clear' command. This removes all visible output and moves the cursor to the top. The command history and scroll buffer are preserved.",
  {
    terminalId: z.string().describe("The terminal ID to clear. Executes the 'clear' command in that terminal."),
  },
  async ({ terminalId }) => {
    // Parse the terminal ID to get window and tab
    const match = terminalId.match(/^iterm-(\d+)-(\d+)$/);
    if (!match) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid terminal ID format: ${terminalId}`,
          },
        ],
      };
    }
    
    const windowId = match[1];
    const tabIndex = parseInt(match[2]);
    
    // Clear the terminal screen
    const script = `
      tell application "iTerm2"
        repeat with aWindow in windows
          if (id of aWindow as string) = "${windowId}" then
            tell aWindow
              if (count of tabs) >= ${tabIndex} then
                tell tab ${tabIndex}
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

server.tool(
  "send-keys",
  "Send keystrokes or text to a terminal for TUI interaction. Use 'keys' for special keys (tab, enter, arrows, ctrl-c, etc.) or 'text' for regular typing. Either 'keys' OR 'text' should be provided, not both.",
  {
    terminalId: z.string().describe("ID of the terminal to send keys to"),
    keys: z.string().optional().describe("Special keys to send. Options: tab, shift-tab, enter, escape, backspace, delete, up, down, left, right, home, end, pageup, pagedown, ctrl-[a-z], f[1-12]"),
    text: z.string().optional().describe("Regular text to type (alternative to keys). Use this for typing normal text like passwords or commands."),
  },
  async ({ terminalId, keys, text }) => {
    // Parse the terminal ID to get window and tab
    const match = terminalId.match(/^iterm-(\d+)-(\d+)$/);
    if (!match) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid terminal ID format: ${terminalId}`,
          },
        ],
      };
    }
    
    const windowId = match[1];
    const tabIndex = parseInt(match[2]);
    
    // Map special keys to their hex codes for iTerm2
    const keyMap = {
      'tab': '\\t',
      'enter': '\\r',
      'escape': '\\033',
      'backspace': '\\177',
      'delete': '\\177',
      'up': '\\033[A',
      'down': '\\033[B',
      'right': '\\033[C',
      'left': '\\033[D',
      'home': '\\033[H',
      'end': '\\033[F',
      'pageup': '\\033[5~',
      'pagedown': '\\033[6~',
      'ctrl-a': '\\001',
      'ctrl-b': '\\002',
      'ctrl-c': '\\003',
      'ctrl-d': '\\004',
      'ctrl-e': '\\005',
      'ctrl-f': '\\006',
      'ctrl-g': '\\007',
      'ctrl-h': '\\010',
      'ctrl-i': '\\t',
      'ctrl-j': '\\n',
      'ctrl-k': '\\013',
      'ctrl-l': '\\014',
      'ctrl-m': '\\r',
      'ctrl-n': '\\016',
      'ctrl-o': '\\017',
      'ctrl-p': '\\020',
      'ctrl-q': '\\021',
      'ctrl-r': '\\022',
      'ctrl-s': '\\023',
      'ctrl-t': '\\024',
      'ctrl-u': '\\025',
      'ctrl-v': '\\026',
      'ctrl-w': '\\027',
      'ctrl-x': '\\030',
      'ctrl-y': '\\031',
      'ctrl-z': '\\032',
      'shift-tab': '\\033[Z',
      'f1': '\\033OP',
      'f2': '\\033OQ',
      'f3': '\\033OR',
      'f4': '\\033OS',
      'f5': '\\033[15~',
      'f6': '\\033[17~',
      'f7': '\\033[18~',
      'f8': '\\033[19~',
      'f9': '\\033[20~',
      'f10': '\\033[21~',
      'f11': '\\033[23~',
      'f12': '\\033[24~',
    };
    
    let sequenceToSend = '';
    
    if (text) {
      // Send regular text (escape it for AppleScript)
      sequenceToSend = escapeForAppleScript(text);
    } else if (keys) {
      // Process special keys
      const keyLower = keys.toLowerCase();
      if (keyMap[keyLower]) {
        // Use hex code for special key
        sequenceToSend = keyMap[keyLower];
      } else {
        // Send as regular text
        sequenceToSend = escapeForAppleScript(keys);
      }
    } else {
      return {
        content: [
          {
            type: "text",
            text: `No keys or text specified`,
          },
        ],
      };
    }
    
    // Send the keystroke using iTerm2's write text command
    // For control characters, we need to use a special approach
    let script;
    
    // Check if this is a control key combination
    if (keys && keys.toLowerCase().startsWith('ctrl-')) {
      // For control keys, use iTerm's special ASCII character sending
      const letter = keys.toLowerCase().charAt(5); // Get the letter after 'ctrl-'
      const controlCode = letter.charCodeAt(0) - 96; // Convert to control code (a=1, b=2, c=3, etc.)
      
      script = `
        tell application "iTerm2"
          repeat with aWindow in windows
            if (id of aWindow as string) = "${windowId}" then
              tell aWindow
                if (count of tabs) >= ${tabIndex} then
                  tell tab ${tabIndex}
                    tell current session
                      -- Send control character using ASCII code
                      write text (ASCII character ${controlCode}) newline NO
                      return "Keys sent"
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
    } else {
      // For regular text and other special keys, use the escape sequences
      script = `
        tell application "iTerm2"
          repeat with aWindow in windows
            if (id of aWindow as string) = "${windowId}" then
              tell aWindow
                if (count of tabs) >= ${tabIndex} then
                  tell tab ${tabIndex}
                    tell current session
                      write text "${sequenceToSend}" newline NO
                      return "Keys sent"
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
    }
    
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
            text: `Sent ${text ? `text: "${text}"` : `key: ${keys}`} to ${terminalId}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to send keys: ${error.message}`,
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