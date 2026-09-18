# Cookbook: syncing a fork without losing your work

English | [中文](syncing-a-fork.zh.md)

Keep a fork up to date with `deepseek-ai/deepseek-harness` while preserving commits you made on the fork. Use a merge to keep history, or a rebase to keep a linear history; never `reset --hard` to the upstream branch.

## 1. Check where you are

```sh
git remote -v
git status # must be clean — stash or commit first
git fetch origin # upstream: https://github.com/deepseek-ai/deepseek-harness.git
git fetch fork   # your fork:  https://github.com/playfuldreamz/deepseek-harness.git
git rev-list --left-right --count fork/master...origin/master
```

`2|2688` means the fork has 2 unique commits and the upstream has 2688 unique commits since the common base. The common base is the last commit both sides share (`git merge-base fork/master origin/master`).

In this repository the checked-out naming is inverted from most guides (`origin` = upstream, `fork` = your fork). Most guides use `origin` for the fork and `upstream` for `deepseek-ai`; swap the names if you follow the conventional layout.

## 2. Option A — GitHub web UI (no CLI)

On `https://github.com/playfuldreamz/deepseek-harness` choose `Sync fork` -> `Update branch` -> `Open pull request` -> merge. This creates the same merge commit as the CLI path below but requires no local conflict resolution when the web UI can auto-merge.

## 3. Option B — CLI merge (preserves history, no force-push)

This keeps both histories and needs no force-push, which is safe when the fork is shared.

```sh
git checkout -b backup-fork-master fork/master # save a recovery point
git checkout master
git merge --ff-only fork/master                # bring your 2 commits to the local master
git merge origin/master                        # merge the 2688 upstream commits
# fix conflicts: edit files -> git add <file> -> git commit
git push fork master
git fetch fork
git rev-list --left-right --count fork/master...origin/master # 4 0 after the fix commit, 0 0 after a clean fast-forward
```

The resulting merge commit had two parents (the upstream tip and the fork tip) and carried 5 files `217++` (`scoped-slots` fix + recovery notes). A follow-up fix corrected the `SessionProvider` test param.

## 4. Option C — CLI rebase (linear history, rewrites the fork)

This replays your commits on top of the upstream tip. It rewrites the fork history and needs a force-push, which is only safe when no one else bases work on the fork.

```sh
git checkout fork/master
git rebase origin/master # replay your 2 commits on top of the 2688
# fix each commit: git add -> git rebase --continue
git push --force-with-lease fork fork/master:master
```

## 5. After the merge

A 2000+ commit merge can leave stale build outputs. `session-persistence-sqlite` was deleted upstream, but `packages/session/session-persistence-sqlite/lib/` can remain as an untracked `lib/` that `tsdown` still tries to bundle (`MISSING_EXPORT`).

```sh
git checkout master
git reset --hard HEAD
pnpm run clean          # RepositoryCleaner removes orphan package dirs and lib/.typecheck
pnpm install            # restores node_modules/typescript/bin/tsc
pnpm run typecheck      # host tsc + tsdown + client tsc; was 186s + 60s in the example
git push fork master --verbose
git ls-remote fork master   # -> the pushed merge tip
git ls-remote origin master # -> the upstream tip you merged
```

Sandbox note: `.agents` is read-only in the WSL sandbox (`Read-only file system` on `touch .agents`). A direct `git checkout master && git reset --hard HEAD` there aborts on `unable to unlink`. The merge above used a writable worktree (`git worktree add /tmp/... origin/master` then `merge fork/master`) plus `git update-ref refs/heads/master <merge-sha>` to move the branch without touching the read-only worktree. Outside the sandbox (normal PowerShell) `checkout`/`reset` work.

## 6. Troubleshooting

* `Updates were rejected because the remote contains work` — the fork moved after you fetched; `git fetch fork` then merge again.
* `MISSING_EXPORT ... from ../session-persistence/src/index.ts` or `lib/index.js:6` importing `DEFAULT_PREPARED_SESSION_CACHE_SIZE` — stale `session-persistence-sqlite/lib/`; `rm -rf packages/session/session-persistence-sqlite` or `pnpm run clean`.
* `Cannot find module '.../typescript/bin/tsc'` after `pnpm run clean` — `node_modules` was removed; `pnpm install` then `pnpm run typecheck`.
* `Could not read Username for 'https://github.com'` on `git push` from WSL — point WSL git at the Windows credential manager once with `git config --global credential.helper "/mnt/c/Program\ Files/Git/mingw64/libexec/git-core/git-credential-manager-core.exe"`, then confirm with a blind lookup (`echo 'url=https://github.com/playfuldreamz/deepseek-harness.git' | git credential fill >/dev/null; echo $?`, exit 0 means stored credentials were found without printing the secret). This reuses the `playfuldreamz` token Windows Git already stores, so later sessions push without per-push setup. Fallback: push from a normal Windows terminal, or set `https://TOKEN@github.com/...` for that push and restore the URL after.
* `refusing to overwrite hooks directory with an invalid ownership marker: .git/dsh-hooks` — stale `C:\...\dsh-hooks` file created with `HOME=/tmp`; `rm -rf -- "C:\Users\...\dsh-hooks"` or `rm -rf .git/dsh-hooks` then `pnpm install` to recreate.

## Verification

```sh
git status --porcelain -b # ## master...origin/master [ahead 4], working tree clean after reset
git branch -vv
git log --oneline --graph -n 4 # newest-first: fix, merge, upstream tip / fork tip
git rev-parse HEAD && git rev-parse fork/master && git rev-parse origin/master
```
