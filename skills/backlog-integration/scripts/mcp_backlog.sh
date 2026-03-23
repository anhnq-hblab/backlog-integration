#!/usr/bin/env bash
# =============================================================================
# MCP Backlog Server Wrapper
# Part of: backlog-integration skill for Antigravity AWF
#
# Usage:
#   source scripts/mcp_backlog.sh
#   mcp_start          # Start MCP server (reads from .brain/backlog.json)
#   mcp_stop           # Stop MCP server
#   mcp_status         # Check if running
#   mcp_config_check   # Validate config and show MCP JSON
# =============================================================================

set -euo pipefail

# --- Defaults ---
MCP_SERVER_PID=""
MCP_LOG_FILE="/tmp/backlog-mcp-server.log"
DEFAULT_CONFIG=".brain/backlog.json"

# --- Helpers ---

_find_config() {
  local config_path="${1:-$DEFAULT_CONFIG}"
  
  # Try relative path first, then absolute
  if [[ -f "$config_path" ]]; then
    echo "$config_path"
    return 0
  fi
  
  # Try from project root (search upward)
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/$config_path" ]]; then
      echo "$dir/$config_path"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  
  echo ""
  return 1
}

_read_config_value() {
  local config_file="$1"
  local key="$2"
  python3 -c "
import json, sys
with open('$config_file') as f:
    config = json.load(f)
print(config.get('$key', ''))
" 2>/dev/null
}

# --- MCP Server Functions ---

mcp_config_check() {
  local config_file
  config_file=$(_find_config "${1:-$DEFAULT_CONFIG}") || {
    echo "❌ Config not found: ${1:-$DEFAULT_CONFIG}"
    echo "   Run /bugfix to set up Backlog integration first."
    return 1
  }
  
  echo "📋 Config file: $config_file"
  
  local space api_key
  space=$(_read_config_value "$config_file" "backlog_space")
  api_key=$(_read_config_value "$config_file" "backlog_api_key")
  
  if [[ -z "$space" ]] || [[ -z "$api_key" ]] || [[ "$api_key" == "xxxxxxxxxxxxxxxxxxxx" ]]; then
    echo "❌ Invalid config: backlog_space or backlog_api_key missing/placeholder"
    return 1
  fi
  
  echo "✅ Space: $space"
  echo "✅ API Key: ${api_key:0:8}..."
  
  # Generate MCP JSON config
  echo ""
  echo "📝 MCP Server Config (copy to Antigravity/Cursor settings):"
  cat <<EOF
{
  "mcpServers": {
    "backlog": {
      "command": "backlog-mcp-server",
      "env": {
        "BACKLOG_DOMAIN": "$space",
        "BACKLOG_API_KEY": "$api_key",
        "OPTIMIZE_RESPONSE": "1",
        "MAX_TOKENS": "10000",
        "ENABLE_TOOLSETS": "space,project,issue,git"
      }
    }
  }
}
EOF
}

mcp_export_env() {
  # Export env vars from .brain/backlog.json for MCP server
  local config_file
  config_file=$(_find_config "${1:-$DEFAULT_CONFIG}") || {
    echo "❌ Config not found" >&2
    return 1
  }
  
  export BACKLOG_DOMAIN=$(_read_config_value "$config_file" "backlog_space")
  export BACKLOG_API_KEY=$(_read_config_value "$config_file" "backlog_api_key")
  export OPTIMIZE_RESPONSE=1
  export MAX_TOKENS=10000
  export ENABLE_TOOLSETS="space,project,issue,git"
  
  echo "✅ MCP env vars exported from $config_file"
}

mcp_start() {
  # Start backlog-mcp-server as background process
  if [[ -n "$MCP_SERVER_PID" ]] && kill -0 "$MCP_SERVER_PID" 2>/dev/null; then
    echo "⚠️  MCP server already running (PID: $MCP_SERVER_PID)"
    return 0
  fi
  
  mcp_export_env "${1:-$DEFAULT_CONFIG}" || return 1
  
  echo "🚀 Starting backlog-mcp-server..."
  backlog-mcp-server > "$MCP_LOG_FILE" 2>&1 &
  MCP_SERVER_PID=$!
  
  sleep 1
  if kill -0 "$MCP_SERVER_PID" 2>/dev/null; then
    echo "✅ MCP server started (PID: $MCP_SERVER_PID)"
    echo "   Log: $MCP_LOG_FILE"
  else
    echo "❌ MCP server failed to start. Check: $MCP_LOG_FILE"
    return 1
  fi
}

mcp_stop() {
  if [[ -n "$MCP_SERVER_PID" ]] && kill -0 "$MCP_SERVER_PID" 2>/dev/null; then
    kill "$MCP_SERVER_PID"
    echo "🛑 MCP server stopped (PID: $MCP_SERVER_PID)"
    MCP_SERVER_PID=""
  else
    echo "ℹ️  MCP server not running"
  fi
}

mcp_status() {
  if [[ -n "$MCP_SERVER_PID" ]] && kill -0 "$MCP_SERVER_PID" 2>/dev/null; then
    echo "🟢 MCP server running (PID: $MCP_SERVER_PID)"
  else
    echo "🔴 MCP server not running"
  fi
  
  # Check if globally installed
  if command -v backlog-mcp-server &>/dev/null; then
    echo "✅ backlog-mcp-server installed: $(which backlog-mcp-server)"
  else
    echo "❌ backlog-mcp-server not installed"
    echo "   Install: npm install -g backlog-mcp-server"
  fi
}

# Show usage when sourced
echo "🤖 MCP Backlog wrapper loaded. Commands:"
echo "   mcp_config_check  — Validate config + show MCP JSON"
echo "   mcp_export_env    — Export env vars for MCP server"
echo "   mcp_start         — Start MCP server"
echo "   mcp_stop          — Stop MCP server"
echo "   mcp_status        — Check server status"
