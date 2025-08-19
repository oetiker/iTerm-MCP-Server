# Changelog

All notable changes to the iTerm MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Complete rewrite to remove hybrid background process approach
- **BREAKING**: Server is now completely stateless - no terminal tracking in memory
- All operations target specific windows/tabs by ID instead of "current window"
- Each terminal opens in its own window for better isolation
- Improved all function descriptions for better AI assistant understanding
- Updated package.json description to reflect new TUI testing capabilities
- All function parameters now have detailed descriptions
- Terminal IDs now use actual window/tab IDs (e.g., `iterm-20543-1`) instead of generic aliases
- All functions now parse terminal IDs directly to extract window and tab numbers
- `list-terminals` now queries iTerm directly for all open windows/tabs

### Added
- Focus restoration - terminals no longer steal focus when created
- Command escaping function for proper AppleScript string handling
- Clear-terminal tool to clear terminal screens
- Comprehensive error handling for window/tab operations
- Lines parameter for read-output to limit output size
- New `send-keys` function for TUI application interaction
  - Support for special keys (tab, enter, arrows, escape, etc.)
  - Support for control key combinations (ctrl-a through ctrl-z)
  - Support for function keys (F1-F12)
  - Ability to type regular text for password fields and forms
- Enhanced documentation for all MCP functions with detailed descriptions
- TUI testing examples in README
- VS Code (Electron-based editor) compatibility support
- Ability to interact with any existing iTerm window/tab using its ID

### Fixed
- AppleScript execution now uses here-doc syntax for better reliability
- Commands with special characters are properly escaped
- Terminal operations work reliably with specific window targeting
- No more dependency on "current window" which was unreliable
- VS Code focus restoration when it's the active application
- Proper handling of Electron process names
- Graceful error handling for unknown application activation
- Removed bug where server required terminals to be tracked in memory

### Removed
- Background process spawning (was causing sync issues)
- Hybrid approach of mixing subprocess with GUI control
- Unnecessary iTerm activation delays
- Removed unnecessary "Terminal ready" echo when opening new windows
- **Removed terminal tracking Map** - server is now stateless
- Removed terminalCounter variable (no longer needed)

### Documentation
- Updated README with comprehensive tool documentation
- Added Claude Code configuration instructions
- Added troubleshooting section
- Included usage examples for AI assistants