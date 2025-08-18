# Changelog

All notable changes to the iTerm MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Complete rewrite to remove hybrid background process approach
- Terminals are now tracked by window ID, tab index, and session ID
- All operations target specific windows/tabs by ID instead of "current window"
- Each terminal opens in its own window for better isolation

### Added
- Focus restoration - terminals no longer steal focus when created
- Command escaping function for proper AppleScript string handling
- Clear-terminal tool to clear terminal screens
- Window/tab tracking with persistent IDs
- Comprehensive error handling for window/tab operations
- Lines parameter for read-output to limit output size

### Fixed
- AppleScript execution now uses here-doc syntax for better reliability
- Commands with special characters are properly escaped
- Terminal operations work reliably with specific window targeting
- No more dependency on "current window" which was unreliable

### Removed
- Background process spawning (was causing sync issues)
- Hybrid approach of mixing subprocess with GUI control
- Unnecessary iTerm activation delays

### Documentation
- Updated README with comprehensive tool documentation
- Added Claude Code configuration instructions
- Added troubleshooting section
- Included usage examples for AI assistants