# CLAUDE.md — cross-stitch-platform monorepo

## Rules

- **Never commit without being asked.** Do not run `git commit`, `git add`, or `git push` unless Olga explicitly says to commit or push. Finish the implementation, then stop and wait.
- **Never use Bash for file operations.** Use Glob (not `find`/`ls`), Grep (not `grep`/`rg`), and Read (not `cat`/`head`/`tail`) tools instead. Reserve Bash for shell-only operations (git, npm, build commands).
- **Use context before searching.** Before searching for a file, check if its location is already documented in READMEs, CLAUDE.md, Focus.md, or other docs already in context. Go directly there instead of doing a broad search.
