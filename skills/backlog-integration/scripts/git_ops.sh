#!/usr/bin/env bash
# =============================================================================
# Git Operations for /bugfix Workflow
# Part of: backlog-integration skill for Antigravity AWF
#
# Usage:
#   source git_ops.sh
#   create_worktree "PROJ-123" "cart-total-bug"     # Isolated worktree (recommended)
#   create_branch "PROJ-123" "cart-total-bug"        # Standard branch (legacy)
#   commit_changes "PROJ-123" "fix: recalculate cart total"
#   push_branch "origin" "bugfix/PROJ-123-cart-total-bug"
#   cleanup_worktree "PROJ-123"
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Protected branches — NEVER push directly to these
PROTECTED_BRANCHES=("main" "master" "develop" "staging" "production")

WORKTREE_BASE=".worktrees"

# =============================================================================
# Safety Checks
# =============================================================================

check_is_git_repo() {
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        echo -e "${RED}ERROR: Not inside a git repository.${NC}" >&2
        return 1
    fi
}

check_not_protected_branch() {
    local branch="$1"
    for protected in "${PROTECTED_BRANCHES[@]}"; do
        if [[ "$branch" == "$protected" ]]; then
            echo -e "${RED}ERROR: Cannot push to protected branch '${branch}'.${NC}" >&2
            echo -e "${YELLOW}Create a bugfix branch first with: create_branch${NC}" >&2
            return 1
        fi
    done
}

check_no_uncommitted_changes() {
    if ! git diff --quiet HEAD 2>/dev/null; then
        echo -e "${YELLOW}WARNING: You have uncommitted changes.${NC}" >&2
        return 1
    fi
}

# =============================================================================
# Worktree Operations (Recommended for isolation)
# =============================================================================

_sanitize_slug() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/-$//'
}

_build_branch_name() {
    local issue_key="$1"
    local slug="${2:-}"
    local branch_name="bugfix/${issue_key}"
    if [[ -n "$slug" ]]; then
        branch_name="bugfix/${issue_key}-$(_sanitize_slug "$slug")"
    fi
    echo "$branch_name"
}

create_worktree() {
    local issue_key="$1"
    local slug="${2:-}"

    check_is_git_repo || return 1

    local branch_name
    branch_name=$(_build_branch_name "$issue_key" "$slug")
    local wt_path="${WORKTREE_BASE}/${branch_name}"

    # Ensure .worktrees/ is gitignored
    if ! grep -qx "${WORKTREE_BASE}/" .gitignore 2>/dev/null; then
        echo "${WORKTREE_BASE}/" >> .gitignore
        echo -e "${BLUE}Added ${WORKTREE_BASE}/ to .gitignore${NC}"
    fi

    if [[ -d "$wt_path" ]]; then
        echo -e "${YELLOW}Worktree already exists: ${wt_path}${NC}"
        echo "$wt_path"
        return 0
    fi

    local base_branch="develop"
    if ! git show-ref --verify --quiet "refs/heads/develop" 2>/dev/null; then
        base_branch=$(git branch --show-current)
    fi

    if git show-ref --verify --quiet "refs/heads/${branch_name}" 2>/dev/null; then
        git worktree add "$wt_path" "$branch_name"
    else
        git worktree add -b "$branch_name" "$wt_path" "$base_branch"
    fi

    echo -e "${GREEN}Worktree created: ${wt_path} (branch: ${branch_name})${NC}"
    echo "$wt_path"
}

cleanup_worktree() {
    local issue_key="$1"
    local slug="${2:-}"

    check_is_git_repo || return 1

    local branch_name
    branch_name=$(_build_branch_name "$issue_key" "$slug")
    local wt_path="${WORKTREE_BASE}/${branch_name}"

    if [[ ! -d "$wt_path" ]]; then
        echo -e "${YELLOW}Worktree not found: ${wt_path}${NC}"
        return 0
    fi

    git worktree remove "$wt_path" --force 2>/dev/null || rm -rf "$wt_path"
    echo -e "${GREEN}Worktree removed: ${wt_path}${NC}"

    # Clean up empty parent dirs
    rmdir "${WORKTREE_BASE}/bugfix" 2>/dev/null || true
    rmdir "${WORKTREE_BASE}" 2>/dev/null || true
}

list_worktrees() {
    check_is_git_repo || return 1
    echo -e "${BLUE}Active worktrees:${NC}"
    git worktree list
}

merge_worktree() {
    local issue_key="$1"
    local slug="${2:-}"
    local target="${3:-develop}"

    check_is_git_repo || return 1

    local branch_name
    branch_name=$(_build_branch_name "$issue_key" "$slug")

    local current_branch
    current_branch=$(git branch --show-current)

    git checkout "$target"
    git merge "$branch_name" --no-ff -m "Merge ${branch_name} into ${target}"
    echo -e "${GREEN}Merged ${branch_name} into ${target}${NC}"

    git checkout "$current_branch" 2>/dev/null || true
}

# =============================================================================
# Branch Operations (Legacy — use create_worktree for new work)
# =============================================================================

create_branch() {
    local issue_key="$1"
    local slug="${2:-}"

    check_is_git_repo || return 1

    local branch_name
    branch_name=$(_build_branch_name "$issue_key" "$slug")

    # Check if branch already exists
    if git show-ref --verify --quiet "refs/heads/${branch_name}" 2>/dev/null; then
        echo -e "${YELLOW}Branch '${branch_name}' already exists. Switching to it.${NC}"
        git checkout "$branch_name"
    else
        echo -e "${BLUE}Creating branch: ${branch_name}${NC}"
        git checkout -b "$branch_name"
    fi

    echo -e "${GREEN}✅ On branch: ${branch_name}${NC}"
    echo "$branch_name"
}

# =============================================================================
# Commit Operations
# =============================================================================

commit_changes() {
    local issue_key="$1"
    local message="$2"
    local use_backlog_keywords="${3:-}"

    check_is_git_repo || return 1

    # Check current branch is not protected
    local current_branch
    current_branch=$(git branch --show-current)
    check_not_protected_branch "$current_branch" || return 1

    # Build commit message
    local commit_msg="[${issue_key}] ${message}"

    # Add Backlog keywords if requested (for Backlog Git integration)
    if [[ "$use_backlog_keywords" == "--backlog-keywords" ]]; then
        commit_msg="${commit_msg} #fix"
        echo -e "${BLUE}ℹ️  Added #fix keyword for Backlog Git auto-status update${NC}"
    fi

    # Stage all changes
    git add -A

    # Check if there are changes to commit
    if git diff --cached --quiet; then
        echo -e "${YELLOW}No changes to commit.${NC}"
        return 0
    fi

    # Show what will be committed
    echo -e "${BLUE}📝 Committing:${NC}"
    git diff --cached --stat
    echo ""

    # Commit
    git commit -m "$commit_msg"
    echo -e "${GREEN}✅ Committed: ${commit_msg}${NC}"
}

# =============================================================================
# Push Operations
# =============================================================================

push_branch() {
    local remote="${1:-origin}"
    local branch="${2:-}"

    check_is_git_repo || return 1

    # Use current branch if not specified
    if [[ -z "$branch" ]]; then
        branch=$(git branch --show-current)
    fi

    # Safety check
    check_not_protected_branch "$branch" || return 1

    echo -e "${BLUE}🚀 Pushing ${branch} to ${remote}...${NC}"
    git push "$remote" "$branch"
    echo -e "${GREEN}✅ Pushed: ${remote}/${branch}${NC}"
}

# =============================================================================
# Utility Functions
# =============================================================================

show_diff_summary() {
    check_is_git_repo || return 1

    local current_branch
    current_branch=$(git branch --show-current)

    echo -e "${BLUE}📊 Changes on branch: ${current_branch}${NC}"
    echo ""

    # Show file changes
    local base_branch="main"
    if git show-ref --verify --quiet "refs/heads/develop" 2>/dev/null; then
        base_branch="develop"
    elif git show-ref --verify --quiet "refs/heads/master" 2>/dev/null; then
        base_branch="master"
    fi

    if git merge-base "$base_branch" HEAD &>/dev/null; then
        echo "Files changed:"
        git diff --stat "$base_branch"...HEAD 2>/dev/null || git diff --stat HEAD~1
    else
        echo "Files changed (vs last commit):"
        git diff --stat HEAD~1 2>/dev/null || echo "  (first commit)"
    fi
}

get_current_branch() {
    check_is_git_repo || return 1
    git branch --show-current
}

get_last_commit_hash() {
    check_is_git_repo || return 1
    git rev-parse --short HEAD
}

# =============================================================================
# If run directly (not sourced), show help
# =============================================================================

if [[ -n "${BASH_SOURCE:-}" && "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Git Operations for /bugfix Workflow"
    echo ""
    echo "Usage: source git_ops.sh"
    echo ""
    echo "Worktree (recommended):"
    echo "  create_worktree <issue_key> [slug]        Create isolated worktree + branch"
    echo "  cleanup_worktree <issue_key> [slug]       Remove worktree after merge/PR"
    echo "  list_worktrees                            List all active worktrees"
    echo "  merge_worktree <issue_key> [slug] [target] Merge worktree branch into target"
    echo ""
    echo "Legacy:"
    echo "  create_branch <issue_key> [slug]          Create and switch to bugfix branch"
    echo ""
    echo "Common:"
    echo "  commit_changes <issue_key> <msg> [--backlog-keywords]  Commit changes"
    echo "  push_branch [remote] [branch]             Push branch to remote"
    echo "  show_diff_summary                         Show change summary"
    echo "  get_current_branch                        Print current branch name"
    echo "  get_last_commit_hash                      Print last commit short hash"
fi
