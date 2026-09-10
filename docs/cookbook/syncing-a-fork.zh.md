# 手册：同步 fork 且不丢失你的改动

[English](syncing-a-fork.md) | 中文

在保留你在 fork 上提交的前提下，将 fork 与 `deepseek-ai/deepseek-harness` 保持同步。使用 merge 保留历史，或使用 rebase 保持线性历史；不要对上游分支执行 `reset --hard`。

## 1. 检查当前位置

```sh
git remote -v
git status # must be clean — stash or commit first
git fetch origin # upstream: https://github.com/deepseek-ai/deepseek-harness.git
git fetch fork   # your fork:  https://github.com/playfuldreamz/deepseek-harness.git
git rev-list --left-right --count fork/master...origin/master
```

`2|2688` 表示 fork 有 2 个独有提交，上游有 2688 个独有提交，共同基点是两侧最后共享的提交（`git merge-base fork/master origin/master`）。

在此仓库的检出中命名与大多数指南相反（`origin` = 上游，`fork` = 你的 fork）。大多数指南使用 `origin` 表示 fork、`upstream` 表示 `deepseek-ai`；若按常规布局操作请互换名称。

## 2. 方案 A — GitHub 网页界面（无需 CLI）

在 `https://github.com/playfuldreamz/deepseek-harness` 选择 `Sync fork` -> `Update branch` -> `Open pull request` -> 合并。当网页界面可自动合并时，这会创建与下方 CLI 路径相同的合并提交，且无需在本地解决冲突。

## 3. 方案 B — CLI merge（保留历史，无需 force-push）

该方式保留双方历史且无需 force-push，适合 fork 被他人共享的场景。

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

在 `b53cd8ff8b` 的结果中，父提交为 `76fda72979`（上游）和 `90a6b731da`（fork），共 5 个文件 `217++`（`scoped-slots` 修复 + 恢复笔记）。后续修复 `efa9131fe8` 纠正了 `SessionProvider` 测试参数。

## 4. 方案 C — CLI rebase（线性历史，重写 fork）

该方式将你的提交重放到上游顶端之上。它会重写 fork 历史并需要 force-push，仅在没有他人基于该 fork 工作时才安全。

```sh
git checkout fork/master
git rebase origin/master # replay your 2 commits on top of the 2688
# fix each commit: git add -> git rebase --continue
git push --force-with-lease fork fork/master:master
```

## 5. 合并后

2000+ 提交的合并可能留下陈旧的构建产物。`session-persistence-sqlite` 已在 `76fda`（`bec6805d6a`）被删除，但 `packages/session/session-persistence-sqlite/lib/` 仍可能以未跟踪的 `lib/` 形式残留，`tsdown` 仍会尝试打包其中的陈旧 `lib/index.js:6`（`MISSING_EXPORT`）。

```sh
git checkout master
git reset --hard HEAD
pnpm run clean          # RepositoryCleaner removes orphan package dirs and lib/.typecheck
pnpm install            # restores node_modules/typescript/bin/tsc
pnpm run typecheck      # host tsc + tsdown + client tsc; was 186s + 60s in the example
git push fork master --verbose
git ls-remote fork master   # -> b53cd8ff8b / efa9131fe8
git ls-remote origin master # -> 76fda72979
```

沙盒说明：`.agents` 在 WSL 沙盒中为只读（`touch .agents` 时出现 `Read-only file system`，`unable to unlink`）。直接执行 `git checkout master && git reset --hard HEAD` 会因此中止。上述合并使用了可写的 worktree（`git worktree add /tmp/... origin/master` 再 `merge fork/master`）加上 `git update-ref refs/heads/master <merge-sha>`，从而在不触碰只读工作树的情况下移动分支。在沙盒外（普通 PowerShell）`checkout`/`reset` 可正常工作。

## 6. 故障排查

* `Updates were rejected because the remote contains work` — 在你 fetch 之后 fork 又有新提交；`git fetch fork` 后再次合并。
* `MISSING_EXPORT ... from ../session-persistence/src/index.ts` 或 `lib/index.js:6` 导入 `DEFAULT_PREPARED_SESSION_CACHE_SIZE` — 陈旧的 `session-persistence-sqlite/lib/`；执行 `rm -rf packages/session/session-persistence-sqlite` 或 `pnpm run clean`。
* 在 `pnpm run clean` 后出现 `Cannot find module '.../typescript/bin/tsc'` — `node_modules` 已被清理；执行 `pnpm install` 再执行 `pnpm run typecheck`。
* 在 WSL 中执行 `git push` 时出现 `Could not read Username for 'https://github.com'` — 用 `git config --global credential.helper "/mnt/c/Program\ Files/Git/mingw64/libexec/git-core/git-credential-manager-core.exe"` 将 WSL git 一次性指向 Windows 凭据管理器，再用盲查确认（`echo 'url=https://github.com/playfuldreamz/deepseek-harness.git' | git credential fill >/dev/null; echo $?`，退出码 0 表示找到了已存凭据且不会打印密钥）。该方式复用 Windows Git 已存的 `playfuldreamz` 令牌，后续会话无需逐次配置即可推送。备选：在普通 Windows 终端中推送，或为该次推送设置 `https://TOKEN@github.com/...` 并在推送后恢复 URL。
* `refusing to overwrite hooks directory with an invalid ownership marker: .git/dsh-hooks` — 因 `HOME=/tmp` 产生的陈旧 `C:\...\dsh-hooks` 文件；执行 `rm -rf -- "C:\Users\...\dsh-hooks"` 或 `rm -rf .git/dsh-hooks` 后执行 `pnpm install` 重建。

## 验证

```sh
git status --porcelain -b # ## master...origin/master [ahead 4], working tree clean after reset
git branch -vv
git log --oneline --graph -n 4 # efa9131 -> b53cd8 -> 76fda / 90a6b
git rev-parse HEAD && git rev-parse fork/master && git rev-parse origin/master
```
