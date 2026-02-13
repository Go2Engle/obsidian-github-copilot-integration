---
allowed-tools: Bash(git checkout:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*), Bash(gh pr create:*), Read, Edit
argument-hint: [major|minor|patch]
description: Commit, push branch, and open a PR. Optionally bump version.
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
- Current manifest version: !`jq -r .version manifest.json`
- Current package.json version: !`jq -r .version package.json`

## Your task

The user wants to ship changes. The argument provided is: `$ARGUMENTS`

If the argument is `major`, `minor`, or `patch`, follow the **full release flow** (version bump + commit + branch + PR). If no argument is provided or the argument is empty, follow the **PR-only flow** (commit + branch + PR, no version bump). If the argument is something other than these three values or empty, stop and tell the user the valid options (e.g. `/ship-it patch` for a release, or `/ship-it` without arguments for a PR without version bump).

---

### PR-only flow (no argument provided)

1. **Create a new branch** with a descriptive, feature-oriented name. Look at the staged and unstaged changes and recent commits to understand what changed, then name the branch accordingly using the format `feature/short-description` or `fix/short-description`. If already on a non-main branch, use the current branch instead.

2. **Stage and commit all changes** with a concise, descriptive commit message summarizing what changed.

3. **Push the branch** to origin with `-u`.

4. **Open a pull request** using `gh pr create` targeting `main` with:
   - **Title:** A concise summary of the changes
   - **Body:** A summary of the changes included in this PR

---

### Full release flow (major, minor, or patch provided)

#### Semantic versioning rules

Given a version `X.Y.Z`:
- **patch** — increment Z (e.g. 1.0.3 -> 1.0.4)
- **minor** — increment Y and reset Z to 0 (e.g. 1.0.3 -> 1.1.0)
- **major** — increment X and reset Y and Z to 0 (e.g. 1.0.3 -> 2.0.0)

#### Steps

1. **Calculate the new version** based on the current version and the bump type above.

2. **Read `manifest.json` and `package.json`**, then use the Edit tool to update the `"version"` field in both files to the new version. Do NOT modify any other fields.

3. **Create a new branch** with a descriptive, feature-oriented name. Look at the staged and unstaged changes and recent commits since the last version bump to understand what changed, then name the branch accordingly using the format `feature/short-description` (e.g. `feature/per-action-model-selector`, `fix/streaming-abort-handling`). If already on a non-main branch, use the current branch instead.

4. **Stage all changes including `manifest.json` and `package.json`**, then **commit** with the message:
   ```
   bump version to NEW_VERSION in manifest and package files
   ```

5. **Push the branch** to origin with `-u`.

6. **Open a pull request** using `gh pr create` targeting `main` with:
   - **Title:** `Release vNEW_VERSION`
   - **Body:** A summary including:
     - The old version and new version
     - The bump type (major/minor/patch)
     - A summary of changes included since the last version bump (use the recent commit log for this)

---

Complete all steps in as few messages as possible. Do not do anything beyond these steps.
