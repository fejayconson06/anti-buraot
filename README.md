# Anti-Buraot

A small, framework-free spend-splitting application. Create a group, record
expenses, choose who paid, split equally, by exact amounts, or by percentage,
edit existing expense cards, and see balances and suggested settlements
automatically.

Groups appear in a saved groups list. Starting a trip creates one expense panel
per calendar day. A testing control can simulate additional days without
waiting, while each day's add button assigns expenses to that date.

## Run locally

Serve the folder with a local web server to use Firebase. If `index.html` is
opened directly through a `file://` URL, the app automatically switches to
local-only browser storage instead.

## Publish with GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then click **Save**.

## Firebase storage

On `http://` and `https://`, groups, expenses, deleted-expense audit records,
and settlements are read from and written directly to Cloud Firestore. Browser
local storage is used only to remember the selected **Viewing as** identity for
each group.

On `file://`, Firebase is not loaded and all trip data is stored in that
browser's local storage.

Anonymous Firebase Authentication identifies the browser installation for
group access. Public groups are readable and writable by every authenticated
app visitor. Private groups require an invite link.
