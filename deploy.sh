#!/usr/bin/env bash
# Sets the site's edit password and publishes the site to GitHub Pages.
#
#   ./deploy.sh              set/keep the password, then commit + push
#   ./deploy.sh --password   only (re)set the password, no commit/push
#
# The password never leaves this machine. It encrypts a GitHub token into
# data/edit-key.json; the site decrypts that token in the browser when the
# password is entered, and uses it to commit edits.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

REPO="avs-art/avs-art.github.io"
BRANCH="main"
KEY_FILE="data/edit-key.json"
MIN_PASSWORD_LENGTH=12
ONLY_PASSWORD=false
[[ "${1:-}" == "--password" ]] && ONLY_PASSWORD=true

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
ask_yes() { # ask_yes "Question" default(y|n)
  local reply hint="[y/N]"; [[ "$2" == y ]] && hint="[Y/n]"
  read -r -p "$1 $hint " reply
  reply="${reply:-$2}"
  [[ "$reply" =~ ^[Yy] ]]
}

for tool in git node curl; do
  command -v "$tool" >/dev/null || die "$tool is required but not installed."
done

# ---------------------------------------------------------------- password

set_password() {
  bold "1. GitHub token"
  cat <<EOF
The site needs a fine-grained token that can write to this repository only:
  https://github.com/settings/personal-access-tokens/new
    Resource owner:     ${REPO%%/*}
    Repository access:  Only select repositories -> ${REPO##*/}
    Permissions:        Contents -> Read and write   (nothing else)
When it expires, run this script again with a new one.

EOF
  local token status reply_file
  reply_file=$(mktemp)
  while true; do
    read -r -s -p "Paste the token (input hidden): " token; echo
    [[ -n "$token" ]] || { echo "Nothing entered."; continue; }
    # header goes through stdin so the token is not visible in the process list
    status=$(printf 'header = "Authorization: Bearer %s"\n' "$token" |
      curl -sS -K - -o "$reply_file" -w '%{http_code}' \
        -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO" || true)
    if [[ "$status" != 200 ]]; then
      echo "GitHub did not accept that token for $REPO (HTTP $status). Try again."
    elif ! grep -q '"push": *true' "$reply_file"; then
      echo "That token cannot write to $REPO — it needs Contents: Read and write."
    else
      rm -f "$reply_file"
      echo "Token accepted."
      break
    fi
    rm -f "$reply_file"
  done

  bold "2. Edit password"
  cat <<EOF
This is what gets typed into the site's "Edit" dialog.
The encrypted token is public, so the password is the only protection:
use at least $MIN_PASSWORD_LENGTH characters — a few random words work well.

EOF
  local password again
  while true; do
    read -r -s -p "New edit password: " password; echo
    if (( ${#password} < MIN_PASSWORD_LENGTH )); then
      echo "Too short — at least $MIN_PASSWORD_LENGTH characters."; continue
    fi
    if [[ "$password" =~ ^(github_pat_|gh[pousr]_) ]]; then
      echo "That looks like a GitHub token, not a password."; continue
    fi
    read -r -s -p "Repeat it: " again; echo
    [[ "$password" == "$again" ]] && break
    echo "The two entries differ."
  done

  EDIT_TOKEN="$token" EDIT_PASSWORD="$password" node tools/make-edit-key.mjs
  unset token password again
}

if [[ -f "$KEY_FILE" ]] && ! $ONLY_PASSWORD; then
  bold "Edit password"
  if ask_yes "A password is already set up. Keep it?" y; then
    echo "Keeping the current password."
  else
    set_password
  fi
else
  set_password
fi

if $ONLY_PASSWORD; then
  echo; echo "Password updated in $KEY_FILE. Run ./deploy.sh to publish it."
  exit 0
fi

# ------------------------------------------------------------------ deploy

bold "3. Publish"
node -e 'JSON.parse(require("fs").readFileSync("data/db.json","utf8"))' || die "data/db.json is not valid JSON."

current_branch=$(git rev-parse --abbrev-ref HEAD)
[[ "$current_branch" == "$BRANCH" ]] || die "You are on '$current_branch'; GitHub Pages deploys from '$BRANCH'."

# Edits made on the live site are commits on GitHub — take them in first.
git fetch --quiet origin "$BRANCH" || die "Could not reach GitHub."

git add -A
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git status --short
  echo
  ask_yes "Commit these changes?" y || die "Stopped. Nothing was committed."
  read -r -p "Commit message [Update site]: " message
  git commit --quiet -m "${message:-Update site}"
fi

if ! git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
  echo "The live site has newer edits; merging them in…"
  git pull --rebase origin "$BRANCH" || die "Could not merge automatically. Resolve the conflict, then run ./deploy.sh again."
fi

if [[ -z "$(git log "origin/$BRANCH..HEAD" --oneline)" ]]; then
  echo "GitHub is already up to date."
  exit 0
fi

git log "origin/$BRANCH..HEAD" --oneline
echo
ask_yes "Push to $REPO ($BRANCH) and publish?" y || die "Stopped before pushing. Your commit is kept locally."
git push origin "$BRANCH"

bold "Done."
echo "Live in about a minute: https://${REPO##*/}"
