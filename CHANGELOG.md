# Changelog

All notable changes to the iTerm MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Use here-doc syntax for AppleScript execution instead of single quotes
- Remove unnecessary iTerm activation and 1-second wait delays
- Improve handling of complex scripts with quotes and special characters
- Add stderr logging for better debugging of AppleScript issues