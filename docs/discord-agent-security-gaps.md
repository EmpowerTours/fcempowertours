# Discord Agent Security Gap Analysis

## Overview

Analysis of gaps between the OpenClaw Discord agent configuration and the EmpowerTours API security implementation.

## Critical Gaps Found

### 1. Missing Wallet Linking in Cron Job Announcements

**Current cron job says:**
```
1️⃣ `@EmpowerTours deposit` - Get deposit address
2️⃣ Send MON to the agent wallet
3️⃣ `@EmpowerTours confirm deposit 0xYourTxHash`
```

**Should say:**
```
1️⃣ `@EmpowerToursAgent link wallet` (REQUIRED FIRST)
2️⃣ Visit link → Connect wallet → Sign message
3️⃣ `@EmpowerToursAgent deposit` - Get deposit address
4️⃣ `@EmpowerToursAgent confirm deposit 0xYourTxHash`
```

**Impact:** Users following current instructions will have deposits REJECTED because wallet isn't linked.

### 2. System Prompt Too Minimal

**Current system prompt:**
- Only mentions the lottery flow
- Doesn't explain HOW to call the API
- Missing Discord ID extraction requirement
- No error handling guidance

**API Requirement:**
- `/api/bot-command` expects `discordId` in every request
- `/api/discord/balance` requires `discordId` for all operations
- Deposits are validated against linked wallet

### 3. Agent Name Inconsistency

**Current cron job uses:** `@EmpowerTours`
**System prompt says:** `@EmpowerToursAgent`

This inconsistency confuses users. Should be consistently `@EmpowerToursAgent`.

### 4. No API Command Integration

**Current setup:**
- Agent responds with text based on system prompt
- No mechanism to actually call `/api/bot-command`

**Required:**
- Agent must call API with `curl` via `exec` tool
- Must extract Discord user ID from message context
- Must parse API response and relay to user

## Security Flow Comparison

### API Implementation (Secure)

```
/api/discord/balance route:
├── link_wallet action
│   ├── Validates wallet address format
│   ├── Generates challenge with timestamp + discordId
│   ├── Stores in Redis with 10-min expiry
│   └── Returns challenge for signing
├── verify_signature action
│   ├── Retrieves stored challenge
│   ├── Uses viem verifyMessage()
│   ├── Links wallet to discordId in Redis
│   └── Cleans up challenge
└── deposit action
    ├── Checks wallet is linked
    ├── Verifies tx.from === linkedWallet
    ├── Rejects deposits from wrong wallet
    └── Credits balance only if verified
```

### Agent Understanding (Gap)

```
Current agent knowledge:
├── Knows about lottery commands ✓
├── Knows agent wallet address ✓
├── MISSING: How to call API
├── MISSING: How to extract Discord ID
├── MISSING: Wallet linking flow
└── MISSING: Why linking is required
```

## Recommended Fixes

### Fix 1: Update System Prompt

Deploy new system prompt with:
- Complete wallet linking flow
- API call instructions with curl examples
- Discord ID extraction requirement
- Command → API endpoint mapping

### Fix 2: Update Cron Job

Update the cron job payload to include wallet linking:

```json
{
  "payload": {
    "message": "... 1️⃣ `@EmpowerToursAgent link wallet` (REQUIRED FIRST) ..."
  }
}
```

### Fix 3: Add Bot Command Skill

Create a skill that teaches the agent to:
1. Extract Discord user ID from message context
2. Call `/api/bot-command` with command + discordId
3. Parse response and format for Discord

### Fix 4: Fix Agent Name Consistency

Update all references to use `@EmpowerToursAgent` consistently.

## Verification Checklist

After fixes, verify:

- [ ] Cron announcements include wallet linking step
- [ ] System prompt explains API calling
- [ ] Agent can extract Discord user ID
- [ ] Agent calls `/api/bot-command` for commands
- [ ] "link wallet" command returns correct URL
- [ ] "deposit" command checks for linked wallet first
- [ ] "confirm deposit" validates sender = linked wallet
- [ ] Agent name is consistent everywhere

## Files to Update

1. `~/.openclaw/system-prompt.md` - New system prompt
2. `~/.openclaw/cron/jobs.json` - Fix cron job payload
3. `~/.openclaw/skills/empowertours-bot/SKILL.md` - Add bot command skill
