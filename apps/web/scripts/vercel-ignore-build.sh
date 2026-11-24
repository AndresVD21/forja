#!/bin/sh
# Vercel "Ignored Build Step" for @forja/web.
#
# Vercel runs this before each build and reads only the exit code:
#   0 -> skip the build ("Canceled by Ignored Build Step")
#   any other code -> build.
# So every case that is not a clear "nothing the app uses changed" must exit 1.
# Vercel runs this with apps/web as the working directory; `sh` is used so the
# file's executable bit does not matter.

set -u

# Turbo has to see the whole workspace, so run from the repo root. The root is
# found from this script's own path, not from the working directory, so the
# script works however Vercel (or a developer) starts it.
root="$(cd "$(dirname "$0")/../../.." && pwd)" || exit 1
cd "$root" || exit 1

# Which commit to compare against.
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  # Normal case: the last commit Vercel deployed on this branch.
  base="$VERCEL_GIT_PREVIOUS_SHA"
else
  # First deployment of a branch: Vercel has no previous commit. Comparing with
  # HEAD^1 would only look at the last commit, which can miss changes made
  # earlier in the branch. Compare with where the branch split from main.
  # Vercel clones shallowly, so main may be missing: fetch a little history.
  # If that fails, build. A broken check must never skip a deploy.
  if ! git fetch --quiet --depth=100 origin main; then
    echo "Could not fetch origin/main to find the branch point: building."
    exit 1
  fi
  base="$(git merge-base FETCH_HEAD HEAD 2>/dev/null)" || base=""
  if [ -z "$base" ]; then
    echo "No common ancestor with main in the fetched history: building."
    exit 1
  fi
fi

# --exit-code makes turbo exit 0 when nothing affects the package and 1 when
# something does. The JSON it prints on stdout is not needed here.
npx -y turbo@2.11.11 query affected --packages @forja/web --exit-code --base "$base" --head HEAD >/dev/null
status=$?

short="$(printf %s "$base" | cut -c1-7)"
if [ "$status" -eq 0 ]; then
  echo "No change affects @forja/web since $short: skipping the build."
  exit 0
fi

# Exit 1 means something changed. Exit 2 or more means turbo itself failed,
# for example on a commit it does not have. Both build.
echo "Change affects @forja/web, or the check failed (turbo exit $status), since $short: building."
exit 1
