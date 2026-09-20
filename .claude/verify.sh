#!/usr/bin/env bash
# =============================================================================
# THE VERIFIER
# =============================================================================
# The autoloop Stop hook (~/.claude/hooks/scripts/verify-loop.sh) runs this.
# Non-zero exit = not done. This file is the definition of "working" for this
# repo. Deterministic only, no LLM calls. Never weaken a check to make it pass.
#
# Detection happens at RUNTIME, so this stays correct as the repo changes.
#
#   VERIFY_SKIP_BUILD=1   skip the (slow) production build step
#   VERIFY_FORGE_ARGS     extra args for forge test (used to drop obsolete tests)
# =============================================================================

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$PATH"

FAILED=0
RAN=0          # CODE checks only. A verifier that skipped everything is NOT green.
SAFETY=0       # once 1, checks stop counting toward RAN: repo-safety checks pass
               # in an empty repo, and must never stand in for proof code works.

step() { printf '\n\033[1m-- %s\033[0m\n' "$1"; }
pass() { printf '\033[32m  PASS\033[0m %s\n' "$1"; [ "$SAFETY" = 0 ] && RAN=$((RAN+1)); return 0; }
fail() { printf '\033[31m  FAIL\033[0m %s\n' "$1"; FAILED=1; [ "$SAFETY" = 0 ] && RAN=$((RAN+1)); return 0; }
skip() { printf '\033[33m  SKIP\033[0m %s\n' "$1"; }   # could-not-check != failed

# Per-repo overrides, so a slow or unusual repo does not need its own fork of
# this file. Anything set here is visible in the output as a SKIP line.
#   STEP_TIMEOUT=420        raise the per-step cap
#   VERIFY_SKIP_PYTEST=1    suite too slow for a stop-gate (say why in the file)
#   VERIFY_SKIP_BUILD=1     skip the production build
# shellcheck disable=SC1091
[ -f .claude/verify.conf ] && . .claude/verify.conf

STEP_TIMEOUT="${STEP_TIMEOUT:-240}"   # keeps the whole run under the hook's 600s

run() {  # run <label> <command...>
    local label="$1"; shift
    local out rc
    out=$(timeout "$STEP_TIMEOUT" "$@" 2>&1); rc=$?
    if [ $rc -eq 0 ]; then pass "$label"
    elif [ $rc -eq 124 ]; then
        fail "$label - TIMED OUT after ${STEP_TIMEOUT}s (raise STEP_TIMEOUT, or make the step faster)"
    else
        fail "$label"; printf '%s\n' "$out" | tail -25 | sed 's/^/      /'
    fi
}

# =============================================================================
# SOLIDITY
# =============================================================================
FDIRS="."
[ -f contracts/foundry.toml ] && FDIRS="contracts"
for FDIR in $FDIRS; do
    [ -f "$FDIR/foundry.toml" ] || continue
    step "solidity ($FDIR)"
    if ! command -v forge >/dev/null 2>&1; then skip "forge not installed"; continue; fi

    BOUT=$( cd "$FDIR" && timeout "$STEP_TIMEOUT" forge build 2>&1 ); BRC=$?
    if [ $BRC -eq 0 ]; then pass "forge build"
    elif [ $BRC -eq 124 ]; then fail "forge build - TIMED OUT after ${STEP_TIMEOUT}s"
    else fail "forge build"; printf '%s\n' "$BOUT" | tail -20 | sed 's/^/      /'; fi

    # forge test EXITS 0 WHEN THERE ARE NO TESTS. An empty suite is the most
    # dangerous kind of green, so assert on parsed output, never the exit code.
    # VERIFY_FORGE_ARGS lets .claude/verify.conf exclude named tests. Excluding a
    # test is a claim that it is obsolete, not that it is inconvenient -- the conf
    # must say why, per test, or this hook is being abused.
    FORGE_ARGS=()
    if [ -n "${VERIFY_FORGE_ARGS:-}" ]; then
        read -ra FORGE_ARGS <<< "$VERIFY_FORGE_ARGS"
        skip "forge test FILTERED by VERIFY_FORGE_ARGS - see .claude/verify.conf"
    fi
    TOUT=$( cd "$FDIR" && timeout "$STEP_TIMEOUT" forge test ${FORGE_ARGS[@]+"${FORGE_ARGS[@]}"} 2>&1 ); TRC=$?
    if [ $TRC -eq 124 ]; then
        fail "forge test - TIMED OUT after ${STEP_TIMEOUT}s"
    elif printf '%s' "$TOUT" | grep -q 'No tests found'; then
        fail "forge test ran ZERO tests (exit 0 is a false green)"
    elif [ $TRC -ne 0 ]; then
        fail "forge test"; printf '%s\n' "$TOUT" | tail -25 | sed 's/^/      /'
    else
        N=$(printf '%s' "$TOUT" | grep -oE '[0-9]+ tests passed' | grep -oE '^[0-9]+' | awk '{s+=$1} END{print s+0}')
        if [ "${N:-0}" -eq 0 ]; then fail "forge test reported no passing tests"
        else pass "forge test ($N passed)"; fi
    fi
done

# =============================================================================
# NODE / TYPESCRIPT
# =============================================================================
if [ -f package.json ]; then
    step "node"
    PM="npm run"; [ -f pnpm-lock.yaml ] && PM="pnpm run"; [ -f yarn.lock ] && PM="yarn"
    if [ ! -d node_modules ]; then
        skip "node_modules absent - run install first (could not check, not a pass)"
    else
        has() { jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null 2>&1; }
        if has typecheck; then run "typecheck" bash -lc "$PM typecheck"
        elif [ -f tsconfig.json ]; then run "tsc --noEmit" bash -lc "npx --no-install tsc --noEmit"; fi
        has lint  && run "lint"  bash -lc "$PM lint"
        has test  && run "test"  bash -lc "$PM test"
        if has build; then
            if [ "${VERIFY_SKIP_BUILD:-0}" = "1" ]; then skip "build (VERIFY_SKIP_BUILD=1)"
            else run "build" bash -lc "$PM build"; fi
        fi
    fi
fi

# =============================================================================
# BROWSER - the only step here that opens a page
# =============================================================================
# Everything else in this file reads source or decodes a fixture. The bugs that
# have actually reached users were display bugs, which is the one thing none of
# that can see. tools/e2e/run.ts boots the app and asserts four things that are
# wrong on any page, forever: raw wei shown to a human, a page with no
# stylesheet, a page that threw, a manifest naming a host that did not serve it.
#
# Costs ~90s (it builds nothing, but it does boot next start), so it follows the
# build's convention: OFF for the in-session stop-gate, ON for the commit gate.
#
#   VERIFY_SKIP_E2E=0   force it on
if [ -f tools/e2e/run.ts ]; then
    step "browser"
    if [ "${VERIFY_SKIP_E2E:-0}" = "1" ]; then
        skip "browser checks (VERIFY_SKIP_E2E=1)"
    elif [ ! -d node_modules/playwright ]; then
        skip "playwright not installed"
    elif [ ! -d "$HOME/.cache/ms-playwright" ]; then
        # Could-not-check, not a pass: `npx playwright install chromium` fixes it.
        skip "no chromium build - run: npx playwright install chromium"
    else
        E2E_TIMEOUT=$(( STEP_TIMEOUT > 300 ? STEP_TIMEOUT : 300 ))
        run "browser checks" bash -lc "E2E_PORT=3319 timeout $E2E_TIMEOUT npx tsx tools/e2e/run.ts"
    fi
fi

# =============================================================================
# DEPLOY ARTIFACT - the thing that actually ships, not just the thing that compiles
# =============================================================================
# A green typecheck+build says the source is sound. It does NOT say the artifact
# the host runs was produced. Both failure modes below have a shipped precedent:
# a Dockerfile that stopped building while CI stayed green, and a Next standalone
# tree served with no CSS and no images because the build's `cp` steps were lost.
#
#   VERIFY_SKIP_DOCKER=1   skip the (slow) image build
#
# Deliberately placed BEFORE the safety section so these count toward RAN: they
# are proof about code, not repo hygiene.

if [ -f Dockerfile ]; then
    step "deploy artifact (docker)"
    if [ "${VERIFY_SKIP_DOCKER:-0}" = "1" ]; then
        skip "docker build (VERIFY_SKIP_DOCKER=1)"
    elif ! command -v docker >/dev/null 2>&1; then
        skip "docker not installed"
    elif ! docker info >/dev/null 2>&1; then
        # A stopped daemon must not read as a pass, and must not read as a fail
        # either - it is a could-not-check.
        skip "docker daemon not reachable"
    else
        # Tag is repo-scoped so parallel repo verifies do not clobber each other.
        run "docker build" bash -lc "docker build -q -t verify-$(basename "$PWD"):ci . >/dev/null"
    fi
fi

# Next.js standalone output: `next build` alone emits server.js with NO static
# assets and NO public/, so the deploy serves an unstyled, imageless site. The
# build script copies both in; this asserts the copies actually landed. Gated on
# the build script naming standalone, so a non-standalone Next repo skips it.
if [ -f package.json ] && grep -q '\.next/standalone' package.json 2>/dev/null; then
    step "deploy artifact (next standalone)"
    if [ "${VERIFY_SKIP_BUILD:-0}" = "1" ]; then
        skip "standalone artifact (build was skipped, so there is nothing to check)"
    elif [ ! -d .next/standalone ]; then
        fail "package.json builds a standalone tree but .next/standalone is absent"
    else
        # Next nests the entrypoint under the path from its inferred file-tracing
        # ROOT to the app, so server.js is flat on Railway (app at /app) but at
        # .next/standalone/projects/fcempowertours/ here, where a parent dir holds
        # node_modules. Asserting the prod path would fail locally on a correct
        # build - the check every developer learns to ignore. Find it instead.
        # -not -path node_modules is load-bearing: react-dom ships its own
        # server.js, and matching that made this pass on a tree with no Next
        # entrypoint at all. A check that cannot fail is not a check.
        SA_SERVER=$(find .next/standalone -maxdepth 5 -name server.js \
            -not -path '*/node_modules/*' -print -quit 2>/dev/null)
        if [ -n "$SA_SERVER" ]; then pass "standalone has an entrypoint ($SA_SERVER)"
        else fail "standalone has NO server.js - 'output: standalone' missing from next.config?"; fi

        # The two cp steps in the build script. Their destination is the top of
        # the standalone tree in both layouts, so these paths ARE portable.
        if [ -d .next/standalone/public ]; then pass "standalone has public/ (images, manifest icons)"
        else fail "standalone is MISSING public/ - the build's 'cp -r public' step was lost"; fi

        # `cp -r .next/static .next/standalone/.next/` lands at .next/static when
        # that dir already exists, and AS .next when it does not. Either way the
        # chunks arrive; their absence means the cp itself is gone.
        if find .next/standalone/.next -maxdepth 2 -name 'chunks' -print -quit 2>/dev/null | grep -q .; then
            pass "standalone has static assets (CSS/JS)"
        else
            fail "standalone is MISSING static assets - the build's 'cp -r .next/static' step was lost"
        fi
    fi
fi

# =============================================================================
# PYTHON
# =============================================================================
if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
    step "python"
    PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
    PYTEST=""; [ -x .venv/bin/pytest ] && PYTEST=.venv/bin/pytest
    [ -z "$PYTEST" ] && command -v pytest >/dev/null 2>&1 && PYTEST=pytest

    command -v ruff >/dev/null 2>&1 && run "ruff check" bash -lc "ruff check ." || true

    HAVE_TESTS=$(find . -path ./.venv -prune -o -path ./node_modules -prune -o -name 'test_*.py' -print 2>/dev/null | head -1)
    if [ "${VERIFY_SKIP_PYTEST:-0}" = "1" ]; then
        skip "pytest (VERIFY_SKIP_PYTEST=1 in .claude/verify.conf - run VERIFY_SKIP_PYTEST=0 to include)"
    elif [ -d tests ] && [ -n "$PYTEST" ]; then
        # Use the CI-style bare invocation. `python -m pytest` inserts CWD into
        # sys.path and `pytest` does not, so the two are NOT interchangeable.
        run "pytest tests/" bash -lc "$PYTEST tests/ -q"
    elif [ -n "$HAVE_TESTS" ]; then
        skip "pytest not installed"
    else
        # No suite: the floor is that every tracked module at least compiles.
        FILES=$(git ls-files '*.py' 2>/dev/null | grep -v '^\.venv/' | head -200 | tr '\n' ' ')
        if [ -n "$FILES" ]; then
            # shellcheck disable=SC2086
            run "python compiles (no test suite present)" bash -lc "$PY -m py_compile $FILES"
        fi
    fi
fi

# =============================================================================
# GO
# =============================================================================
if [ -f go.mod ]; then
    step "go"
    if command -v go >/dev/null 2>&1; then
        run "go build ./..." bash -lc "go build ./..."
        run "go vet ./..."   bash -lc "go vet ./..."
        if go test ./... -run XXXNONEXISTENT >/dev/null 2>&1; then
            run "go test ./..." bash -lc "go test ./..."
        else
            skip "go test skipped (packages do not build for test)"
        fi
    else
        skip "go not installed"
    fi
fi

# =============================================================================
# REPO INVARIANTS - tools/verify-*.ts
# =============================================================================
# Each of these encodes a bug that actually shipped: a frame image that rendered
# black, a public audio URL that served the full track, a payout split hardcoded
# at the wrong percentage. They were all written and then never run by anything,
# which makes them documentation, not gates. Discovery is a glob so a new one is
# live the moment it is added -- nobody has to remember to register it.
if ls tools/verify-*.ts >/dev/null 2>&1; then
    step "repo invariants"
    INV=0

    # tsconfig.json EXCLUDES "tools", so `npm run typecheck` silently skips every
    # file here - that is how a dangling call to a deleted function survived a
    # "tsc clean" report. tools/ runs migrations and pins metadata, and the
    # invariants below live here too: an invariant that no longer compiles is an
    # invariant that is not defending anything.
    #
    # tsconfig.tools.json is the root config with that exclusion lifted. It must
    # stay at the repo root: `paths` resolves relative to the file declaring it,
    # so a tools/tsconfig.json reports "Cannot find module '@/lib/...'" on code
    # that is perfectly fine - 19 of the first 27 errors here were that.
    if [ -f tsconfig.tools.json ]; then
        TT_OUT=$(timeout "$STEP_TIMEOUT" npx tsc --noEmit -p tsconfig.tools.json 2>&1)
        # A peer session edits this repo live, so tools/ can hold somebody's
        # uncommitted work in progress. The gate's job is the REPO: an untracked
        # file must not turn it red, and every tracked one still must. Filtered
        # by path from git, not by a name pinned in this file, so the exemption
        # disappears by itself the moment the file is committed.
        TT_UNTRACKED=$(git ls-files --others --exclude-standard -- 'tools/*.ts' 2>/dev/null)
        TT_REAL="$TT_OUT"
        for TT_U in $TT_UNTRACKED; do
            TT_REAL=$(printf '%s\n' "$TT_REAL" | grep -vF "$TT_U" || true)
        done
        TT_REAL=$(printf '%s\n' "$TT_REAL" | grep "error TS" || true)
        if [ -n "$TT_REAL" ]; then
            fail "tools/ typecheck"
            printf '%s\n' "$TT_REAL" | head -15 | sed 's/^/      /'
        else
            pass "tools/ typecheck"
            [ -n "$TT_UNTRACKED" ] && \
                skip "untracked tools/ files not checked: $(printf '%s' "$TT_UNTRACKED" | tr '\n' ' ')"
        fi
    fi

    for V in tools/verify-*.ts; do
        run "$(basename "$V")" npx tsx "$V"
        INV=$((INV+1))
    done
    # A glob that matches nothing silently passes. It matched here, so this only
    # guards against the loop body being skipped some other way.
    [ "$INV" -gt 0 ] || fail "tools/verify-*.ts matched but ran nothing"
fi

# =============================================================================
# REPO SAFETY - encodes mistakes that have actually happened on this machine
# =============================================================================
SAFETY=1
step "repo safety"

# .env must never be tracked.
if git ls-files 2>/dev/null | grep -qE '(^|/)\.env($|\.local$|\.production$)'; then
    fail ".env is tracked by git"
else
    pass ".env not tracked"
fi

# A hardcoded private key. Matched as an ASSIGNMENT to a key-shaped name so that
# a 64-hex tx hash in a comment or fixture does not trip it.
if git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.sol' '*.go' 2>/dev/null | xargs -r grep -lInE \
     '(PRIVATE_KEY|privateKey|MNEMONIC|mnemonic|SECRET_KEY)[^=]{0,20}=[[:space:]]*["'"'"']?(0x)?[a-fA-F0-9]{64}' 2>/dev/null \
     | grep -q .; then
    fail "hardcoded private key / mnemonic assigned in tracked source"
else
    pass "no hardcoded key material"
fi

# NOTE: a "no --broadcast" check deliberately does NOT live here. Every contracts
# repo has a human-run deploy script, and fcempowertours broadcasts from a keeper
# workflow by design, so a universal version fires constantly on correct code.
# Put it in a repo-specific verifier where the policy is actually known.

# =============================================================================
step "result"
if [ "$RAN" -eq 0 ]; then
    printf '\n\033[31mFAIL: no checks could run - this verifier proved nothing.\033[0m\n'
    exit 1
fi
if [ "$FAILED" -ne 0 ]; then
    printf '\n\033[31mVERIFY FAILED (%s checks ran)\033[0m\n' "$RAN"
    exit 1
fi
printf '\n\033[32mALL CHECKS PASSED (%s checks ran)\033[0m\n' "$RAN"
exit 0
