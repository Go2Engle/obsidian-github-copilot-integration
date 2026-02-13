---
allowed-tools: Bash(git checkout:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*), Bash(gh pr create:*), Read, Edit
argument-hint: <major|minor|patch>
description: Bump version, commit, push branch, and open a PR
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
- Current manifest version: !`jq -r .version manifest.json`
- Current package.json version: !`jq -r .version package.json`

## Your task

The user wants to ship a release. The argument provided is: `$ARGUMENTS`

This argument MUST be one of: `major`, `minor`, or `patch`. If the argument is missing or not one of these three values, stop and ask the user to provide one (e.g. `/ship-it patch`).

### Semantic versioning rules

Given a version `X.Y.Z`:
- **patch** — increment Z (e.g. 1.0.3 -> 1.0.4)
- **minor** — increment Y and reset Z to 0 (e.g. 1.0.3 -> 1.1.0)
- **major** — increment X and reset Y and Z to 0 (e.g. 1.0.3 -> 2.0.0)

### Steps

1. **Calculate the new version** based on the current version and the bump type above.

2. **Read `manifest.json` and `package.json`**, then use the Edit tool to update the `"version"` field in both files to the new version. Do NOT modify any other fields.

3. **Create a new branch** with a descriptive, feature-oriented name. Look at the staged and unstaged changes and recent commits since the last version bump to understand what changed, then name the branch accordingly using the format `feature/short-description` (e.g. `feature/per-action-model-selector`, `fix/streaming-abort-handling`). If already on a non-main branch, use the current branch instead.

4. **Stage only `manifest.json` and `package.json`**, then **commit** with the message:
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

Complete all steps in as few messages as possible. Do not do anything beyond these steps.
