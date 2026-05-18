#!/usr/bin/env bash
# Dump the three CSVs the audit reads from GAM so they can be fed back in
# via `node dist/index.js --forwarding-input ... --users-input ...` for
# offline iteration. Run this anywhere you have a working `gam` install
# (NOT this codespace — see project_gws_admin_auth memory).
#
# Usage:
#   scripts/dump-csvs.sh [output-dir]
# Defaults output-dir to ./out/dumps.

set -uo pipefail

OUT_DIR="${1:-out/dumps}"
mkdir -p "$OUT_DIR"

if ! command -v gam >/dev/null 2>&1; then
  echo "error: gam not on PATH" >&2
  echo "install GAM7 first: https://github.com/GAM-team/GAM/wiki" >&2
  exit 1
fi

# Each dump is independent — keep going even if one fails, so a missing DwD
# scope on one command doesn't blank the other two outputs. Exit code at the
# end reflects whether ALL three succeeded.
fails=0

run_dump() {
  local label="$1" out="$2"; shift 2
  echo "==> $label ($*)"
  if ! "$@" > "$out" 2> "$out.stderr"; then
    echo "  FAILED — see $out.stderr (last 5 lines):" >&2
    tail -n 5 "$out.stderr" >&2 || true
    fails=$((fails + 1))
  fi
}

run_dump "forwarding"   "$OUT_DIR/forwarding.csv"     gam all users print forward
run_dump "users"        "$OUT_DIR/users.csv"          gam print users fields primaryEmail,givenName,familyName,suspended,isAdmin,orgUnitPath,recoveryEmail,lastLoginTime
run_dump "group-members" "$OUT_DIR/group-members.csv" gam print group-members types user fields group,email
run_dump "gmail-report"  "$OUT_DIR/gmail-report.csv"  gam report users parameters gmail:last_interaction_time

echo
echo "wrote:"
ls -la "$OUT_DIR"
echo
echo "now run the audit offline:"
echo "  node dist/index.js \\"
echo "    --forwarding-input $OUT_DIR/forwarding.csv \\"
echo "    --users-input $OUT_DIR/users.csv"
echo
echo "(group-members.csv isn't wired to a CLI flag yet — index.ts fetches it"
echo "via gam directly.)"

if [ "$fails" -gt 0 ]; then
  echo
  echo "$fails dump(s) failed; partial output above." >&2
  exit 1
fi
