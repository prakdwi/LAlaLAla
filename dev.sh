#!/usr/bin/env bash
# Run La La La La Studio locally with separate log panes.
#
#   ./dev.sh            split terminal: FRONTEND (Vite) | BACKEND (engine typecheck + unit tests)
#   ./dev.sh --no-split run both in this terminal with [frontend]/[backend] prefixes
#   ./dev.sh --kill     stop a running split session
#
# The app is browser-only, so "backend" here is the engine toolchain:
# tsc --watch for the audio engine/state types and vitest --watch for the unit suite.
set -euo pipefail
cd "$(dirname "$0")"

SESSION="lalalala"
PORT="${PORT:-5173}"
FRONTEND_CMD="npm run dev -- --port $PORT --strictPort --host 127.0.0.1"
BACKEND_CMD="npm run backend"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ "${1:-}" = "--kill" ]; then
  command -v tmux >/dev/null && tmux kill-session -t "$SESSION" 2>/dev/null && echo "Stopped $SESSION." || echo "No tmux session named $SESSION."
  exit 0
fi

if [ "${1:-}" = "--no-split" ]; then
  trap 'kill 0' EXIT INT TERM
  ( $FRONTEND_CMD 2>&1 | sed -u 's/^/[frontend] /' ) &
  ( $BACKEND_CMD  2>&1 | sed -u 's/^/[backend]  /' ) &
  wait
  exit 0
fi

if command -v tmux >/dev/null; then
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux new-session -d -s "$SESSION" -n studio -x 220 -y 50
  tmux send-keys -t "$SESSION:studio" "printf '\\033]2;FRONTEND\\033\\\\'; $FRONTEND_CMD" C-m
  tmux split-window -h -t "$SESSION:studio"
  tmux send-keys -t "$SESSION:studio.1" "printf '\\033]2;BACKEND\\033\\\\'; $BACKEND_CMD" C-m
  tmux select-pane -t "$SESSION:studio.0" -T FRONTEND
  tmux select-pane -t "$SESSION:studio.1" -T BACKEND
  tmux set-option -t "$SESSION" pane-border-status top
  tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "
  tmux select-pane -t "$SESSION:studio.0"
  echo "Frontend: http://127.0.0.1:$PORT   (Ctrl-b then arrow keys to switch panes, Ctrl-b d to detach, ./dev.sh --kill to stop)"
  exec tmux attach -t "$SESSION"
fi

if [ "$(uname)" = "Darwin" ] && [ -d "/Applications/iTerm.app" ]; then
  HERE="$(pwd)"
  osascript <<APPLESCRIPT
tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    set name to "FRONTEND"
    write text "cd '$HERE' && $FRONTEND_CMD"
    set backendPane to (split vertically with default profile)
  end tell
  tell backendPane
    set name to "BACKEND"
    write text "cd '$HERE' && $BACKEND_CMD"
  end tell
end tell
APPLESCRIPT
  echo "Frontend: http://127.0.0.1:$PORT"
  exit 0
fi

echo "tmux not found. Install it (apt install tmux / brew install tmux) or run: ./dev.sh --no-split"
exit 1
