# Anti-Buraot

A small, framework-free spend-splitting application. Create a group, record
expenses, choose who paid, split equally, by exact amounts, or by percentage,
edit existing expense cards, and see balances and suggested settlements
automatically.

Groups appear in a saved groups list. Starting a trip creates one expense panel
per calendar day. A testing control can simulate additional days without
waiting, while each day's add button assigns expenses to that date.

## Run locally

Open `index.html` in any browser. No install, build, or local server is required.

## Publish with GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then click **Save**.

## Firebase later

The current version stores the group and expenses in the browser's local
storage. Data stays on that device and browser. The small `dataStore` layer in
`app.js` can be replaced with Firebase later without changing the interface or
split calculations.
