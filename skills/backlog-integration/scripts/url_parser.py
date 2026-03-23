#!/usr/bin/env python3
"""
URL/Issue Key Parser for Backlog.com
Part of: backlog-integration skill for Antigravity AWF

Parses various input formats into structured data:
  - "PROJ-123"
  - "https://myteam.backlog.com/view/PROJ-123"
  - "https://myteam.backlog.com/view/PROJ-123#comment-456"

Usage:
    python3 url_parser.py "PROJ-123"
    python3 url_parser.py "https://myteam.backlog.com/view/PROJ-123"
    python3 url_parser.py --test
"""

import argparse
import json
import re
import sys


def parse_input(user_input: str, default_space: str = None) -> dict:
    """
    Parse user input into structured data.

    Args:
        user_input: Issue key (e.g., "PROJ-123") or Backlog URL
        default_space: Default Backlog space from config (e.g., "myteam.backlog.com")

    Returns:
        dict with keys: space, issue_key, comment_id (optional)

    Raises:
        ValueError: If input cannot be parsed
    """
    user_input = user_input.strip()

    if not user_input:
        raise ValueError("Empty input. Provide an issue key (e.g., PROJ-123) or Backlog URL.")

    # Pattern 1: Full URL
    # https://myteam.backlog.com/view/PROJ-123
    # https://myteam.backlog.com/view/PROJ-123#comment-456
    url_pattern = re.compile(
        r"^https?://([a-zA-Z0-9-]+\.backlog(?:tool)?\.com)/view/([A-Z][A-Z0-9_]+-\d+)"
        r"(?:#comment-(\d+))?",
        re.IGNORECASE
    )

    url_match = url_pattern.match(user_input)
    if url_match:
        space = url_match.group(1).lower()
        issue_key = url_match.group(2).upper()
        comment_id = url_match.group(3)  # None if not present

        result = {
            "space": space,
            "issue_key": issue_key,
        }
        if comment_id:
            result["comment_id"] = comment_id
        return result

    # Pattern 2: Issue key only
    # PROJ-123
    key_pattern = re.compile(r"^([A-Z][A-Z0-9_]+-\d+)$", re.IGNORECASE)
    key_match = key_pattern.match(user_input)
    if key_match:
        issue_key = key_match.group(1).upper()
        if not default_space:
            raise ValueError(
                f"Issue key '{issue_key}' detected but no Backlog space configured.\n"
                f"Either provide a full URL or set up .brain/backlog.json."
            )
        return {
            "space": default_space,
            "issue_key": issue_key,
        }

    # Pattern 3: URL-like but doesn't match expected format
    if "backlog.com" in user_input.lower():
        raise ValueError(
            f"URL format not recognized: {user_input}\n"
            f"Expected: https://SPACE.backlog.com/view/PROJ-123"
        )

    # Nothing matched
    raise ValueError(
        f"Cannot parse input: '{user_input}'\n"
        f"Accepted formats:\n"
        f"  - PROJ-123\n"
        f"  - https://myteam.backlog.com/view/PROJ-123\n"
        f"  - https://myteam.backlog.com/view/PROJ-123#comment-456"
    )


def run_tests():
    """Run self-tests for the parser."""
    print("🧪 Running URL parser tests...\n")
    passed = 0
    failed = 0

    def assert_eq(test_name, actual, expected):
        nonlocal passed, failed
        if actual == expected:
            print(f"  ✅ {test_name}")
            passed += 1
        else:
            print(f"  ❌ {test_name}")
            print(f"     Expected: {expected}")
            print(f"     Actual:   {actual}")
            failed += 1

    def assert_raises(test_name, func, *args):
        nonlocal passed, failed
        try:
            func(*args)
            print(f"  ❌ {test_name} — Expected ValueError, got no error")
            failed += 1
        except ValueError:
            print(f"  ✅ {test_name}")
            passed += 1

    # Test 1: Simple issue key
    print("Test Group 1: Issue Key Parsing")
    result = parse_input("PROJ-123", "myteam.backlog.com")
    assert_eq("Simple key", result, {"space": "myteam.backlog.com", "issue_key": "PROJ-123"})

    result = parse_input("MY_APP-456", "team.backlog.com")
    assert_eq("Key with underscore", result, {"space": "team.backlog.com", "issue_key": "MY_APP-456"})

    # Test 2: Full URL
    print("\nTest Group 2: URL Parsing")
    result = parse_input("https://myteam.backlog.com/view/PROJ-123")
    assert_eq("Simple URL", result, {"space": "myteam.backlog.com", "issue_key": "PROJ-123"})

    result = parse_input("https://company.backlog.com/view/APP-999")
    assert_eq("Different space", result, {"space": "company.backlog.com", "issue_key": "APP-999"})

    # Test 3: URL with comment anchor
    print("\nTest Group 3: URL with Comment")
    result = parse_input("https://myteam.backlog.com/view/PROJ-123#comment-456")
    assert_eq("URL with comment", result, {
        "space": "myteam.backlog.com",
        "issue_key": "PROJ-123",
        "comment_id": "456"
    })

    result = parse_input("https://team.backlog.com/view/BUG-1#comment-99999")
    assert_eq("URL with large comment ID", result, {
        "space": "team.backlog.com",
        "issue_key": "BUG-1",
        "comment_id": "99999"
    })

    # Test 4: Case insensitivity
    print("\nTest Group 4: Case Handling")
    result = parse_input("proj-123", "myteam.backlog.com")
    assert_eq("Lowercase key → uppercase", result, {"space": "myteam.backlog.com", "issue_key": "PROJ-123"})

    # Test 5: Error cases
    print("\nTest Group 5: Error Handling")
    assert_raises("Empty input", parse_input, "")
    assert_raises("Key without space config", parse_input, "PROJ-123", None)
    assert_raises("Random string", parse_input, "hello world")
    assert_raises("Bad URL format", parse_input, "https://myteam.backlog.com/issues/PROJ-123")

    # Summary
    total = passed + failed
    print(f"\n{'='*40}")
    print(f"Results: {passed}/{total} passed, {failed} failed")
    if failed == 0:
        print("✅ All tests passed!")
    else:
        print("⚠️  Some tests failed.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Parse Backlog issue key or URL")
    parser.add_argument("input", nargs="?", help="Issue key or Backlog URL to parse")
    parser.add_argument("--space", help="Default Backlog space (from config)")
    parser.add_argument("--test", action="store_true", help="Run self-tests")

    args = parser.parse_args()

    if args.test:
        run_tests()
        return

    if not args.input:
        parser.print_help()
        sys.exit(1)

    try:
        result = parse_input(args.input, default_space=args.space)
        print(json.dumps(result, indent=2))
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
