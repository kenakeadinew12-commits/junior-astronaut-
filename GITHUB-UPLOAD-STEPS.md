# Uploading this folder to GitHub through the website

1. Sign in at github.com, click **+ → New repository**, name it (for example `lunar-outpost`), keep it Public or Private, do NOT tick "Add a README", click **Create repository**.
2. On the empty repository page click **uploading an existing file**.
3. Open the `lunar_outpost_flat` folder on your computer, select ALL files inside it (Ctrl+A / Cmd+A) and drag them into the GitHub page. Drag the files, not the folder itself, or GitHub will create a `lunar_outpost_flat/` subfolder.
   - Hidden files (`.gitignore`, `.nojekyll`) are skipped by some file pickers. On Mac press Cmd+Shift+. in Finder to show them; on Windows enable "Hidden items" in File Explorer. If they do not upload, add them later with **Add file → Create new file**.
   - GitHub allows up to 100 files per browser upload; this folder has fewer than that.
4. Write a commit message such as "Add Lunar Outpost game" and click **Commit changes** (to the `main` branch).
5. Optional: automatic publishing to GitHub Pages.
   - Click **Add file → Create new file**. In the name box type `.github/workflows/deploy.yml` (typing each `/` creates the folders).
   - Open `github-workflow-deploy.yml` from this folder in a text editor, copy everything, paste it into the new file, and commit.
   - In the repository go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow runs on every push to `main`; its Actions tab shows progress, and the site address appears in Settings → Pages.
   - The workflow runs `npm test` and `npm run build`, neither of which has been run with a real `npm install` here, so check the Actions log on the first run.
6. `package-lock.json` is missing. On your own computer run `npm install` once in this folder, then upload the new `package-lock.json` with **Add file → Upload files**.
7. The files `github-workflow-deploy.yml` and `GITHUB-UPLOAD-STEPS.md` can stay in the repository or be deleted after step 5.
