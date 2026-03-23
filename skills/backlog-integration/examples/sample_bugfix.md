# 📝 Sample: /bugfix Workflow Walkthrough

## Scenario
Bug trên Backlog: SHOP-456 — "Cart total shows wrong amount after removing item"

---

## Step 1: User triggers /bugfix

```
User: /bugfix https://myteam.backlog.com/view/SHOP-456
```

## Step 2: AI fetches bug info

```
📥 BUG INFO:

🔑 Issue: SHOP-456
📝 Title: Cart total shows wrong amount after removing item
🔴 Priority: High
👤 Assigned: Taro Yamada
📅 Created: 2026-03-10

📋 Description:
When user removes an item from cart, the total price doesn't
update immediately. Need to refresh the page to see correct total.

💬 Comments: 2 comments
  - [Mar 11] PM: "Customer reported this on production"
  - [Mar 12] QA: "Reproducible on Chrome and Safari"
```

## Step 3: AI analyzes root cause

```markdown
## 🔍 Root Cause Analysis

**Bug:** SHOP-456 — Cart total shows wrong amount after removing item
**Severity:** 🔴 High

### Nguyên nhân
- `app/Services/CartService.php:145` — Method `recalculateTotal()` is NOT
  called after `removeItem()`. The total stays stale until page refresh.
- Cart state mutation happens without dispatching `CartUpdated` event,
  so listeners (including the price display) never get notified.

### Affected Files
- `app/Services/CartService.php` (primary — missing recalculate call)
- `app/Events/CartUpdated.php` (needs to be dispatched)
- `resources/js/components/CartSummary.vue` (listens for updates)

### Impact
- Ảnh hưởng: All users who remove items from cart
- Scope: Cart module only — payment is unaffected (recalculates at checkout)
- Risk: Medium — incorrect display may cause user confusion
```

## Step 4: Dev confirms and chooses fix mode

```
User: 1️⃣ Fix luôn
```

## Step 5: AI fixes code

Changes made:
- `CartService.php:145` — Added `$this->recalculateTotal()` call after removeItem
- `CartService.php:148` — Added `event(new CartUpdated($cart))` dispatch

## Step 6: Git operations

```bash
$ git checkout -b bugfix/SHOP-456-cart-total-wrong-amount
$ git add -A
$ git commit -m "[SHOP-456] fix: recalculate cart total after removeItem"
$ git push origin bugfix/SHOP-456-cart-total-wrong-amount
```

## Step 7: Log to Backlog

Comment posted on SHOP-456:

```markdown
## 🤖 AI Bug Fix Report

### Root Cause
Method `recalculateTotal()` not called after `removeItem()` in CartService.

### Solution Applied
- Added `recalculateTotal()` call after item removal
- Added `CartUpdated` event dispatch for reactive UI update

### Impact Assessment
- **Scope:** Cart module
- **Risk:** Low — isolated change, payment unaffected
- **Test:** ✅ Unit tests passing

### Git Reference
- Branch: `bugfix/SHOP-456-cart-total-wrong-amount`
- PR: [#789](https://github.com/team/repo/pull/789)
- Commit: `a1b2c3d`
```

## Step 8: Client report (optional)

Summary report generated at `outputs/bugfix/SHOP-456-summary.md`:

| Item | Detail |
|------|--------|
| **Issue** | [SHOP-456] Cart total shows wrong amount |
| **Severity** | 🔴 High |
| **Root Cause** | `recalculateTotal()` missing after `removeItem()` |
| **Solution** | Added recalculate + event dispatch |
| **Files Changed** | `CartService.php`, `CartUpdated.php` |
| **PR** | [#789](link) |
| **Test** | ✅ Passed |
| **Risk** | Low |
| **Fixed By** | Dev + AI |
| **Date** | 2026-03-13 |

---

## Result

✅ Bug fixed, code pushed, Backlog logged, client report ready — all in one `/bugfix` command!
