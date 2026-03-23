#!/usr/bin/env bash
# =============================================================================
# Git Operations for /bugfix Workflow
# Part of: backlog-integration skill for Antigravity AWF
#
# Usage:
#   source git_ops.sh
#   create_branch "PROJ-123" "cart-total-bug"
#   commit_changes "PROJ-123" "fix: recalculate cart total"
#   push_branch "origin" "bugfix/PROJ-123-cart-total-bug"
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
# Branch Operations
# =============================================================================

create_branch() {
    local issue_key="$1"
    local slug="${2:-}"

    check_is_git_repo || return 1

    # Build branch name
    local branch_name="bugfix/${issue_key}"
    if [[ -n "$slug" ]]; then
        # Sanitize slug: lowercase, replace spaces with hyphens, remove special chars
        slug=$(echo "$slug" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/-$//')
        branch_name="bugfix/${issue_key}-${slug}"
    fi

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

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Git Operations for /bugfix Workflow"
    echo ""
    echo "Usage: source git_ops.sh"
    echo ""
    echo "Functions:"
    echo "  create_branch <issue_key> [slug]          Create and switch to bugfix branch"
    echo "  commit_changes <issue_key> <msg> [--backlog-keywords]  Commit changes"
    echo "  push_branch [remote] [branch]             Push branch to remote"
    echo "  show_diff_summary                         Show change summary"
    echo "  get_current_branch                        Print current branch name"
    echo "  get_last_commit_hash                      Print last commit short hash"
fi
