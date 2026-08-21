# Anti-Buraot

A small, framework-free spend-splitting application. Create a group, record
expenses, choose who paid, split equally, by exact amounts, or by percentage,
edit existing expense cards, and see balances and suggested settlements
automatically.

Groups appear in a saved groups list. Starting a trip creates one expense panel
per calendar day. A testing control can simulate additional days without
waiting, while each day's add button assigns expenses to that date.

## Run locally

Serve the folder with a local web server, then open its HTTP URL in a browser.
The app loads the Firebase web SDK as ES modules, so opening `index.html`
through a `file://` URL is not supported.

## Publish with GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then click **Save**.

## Firebase storage

Groups, expenses, deleted-expense audit records, and settlements are read from
and written directly to Cloud Firestore. Browser local storage is used only to
remember the selected **Viewing as** identity for each group.

Anonymous Firebase Authentication identifies the browser installation for
group access. Public groups are readable and writable by every authenticated
app visitor. Private groups require an invite link.
