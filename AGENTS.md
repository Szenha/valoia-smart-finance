> [!IMPORTANT]
> **Commit/push policy:** Never run `git add`, `git commit`, or `git push` automatically at
> the end of a task. Implement the requested changes and stop, leaving them uncommitted in
> the working directory so the user can test locally (`bun run dev`) first. Only stage,
> commit, and push when the user explicitly asks for it (e.g. "comita", "pode subir", "sobe
> pro GitHub", "commit e push", or equivalent). This is intentional: pushes to the main
> branch trigger an automatic Cloudflare deploy (see `.github/workflows/deploy.yml`), so the
> user wants to keep manual control over exactly when something ships to production.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
