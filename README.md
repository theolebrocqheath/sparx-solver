# Sparx Solver

Automate your Sparx Maths homework. Runs locally on your computer — no accounts, no payments, no data sent anywhere.

---

## How to Use (Step by Step)

### Step 1 — Install Node.js

You need Node.js installed. You only do this once.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the big green **LTS** button to download
3. Open the downloaded file and follow the installer (just keep clicking Next/Continue)
4. When it's done, restart your computer

**To check it worked:** open Terminal (Mac) or Command Prompt (Windows) and type `node -v`. You should see something like `v20.18.0`.

### Step 2 — Download Sparx Solver

**Option A — If you have Git:**
Open Terminal (Mac) or Command Prompt (Windows) and run:
```
git clone https://github.com/theolebrocqheath/sparx-solver.git
```

**Option B — If you don't have Git:**
1. Go to **[github.com/theolebrocqheath/sparx-solver](https://github.com/theolebrocqheath/sparx-solver)**
2. Click the green **Code** button
3. Click **Download ZIP**
4. Unzip the downloaded file
5. Move the `sparx-solver` folder somewhere easy to find (like your Desktop)

### Step 3 — Launch

- **Mac:** Double-click `start.command` inside the sparx-solver folder.
  - If macOS says "can't be opened because it is from an unidentified developer": right-click it → **Open** → click **Open** again.
- **Windows:** Double-click `start.bat` inside the sparx-solver folder.

A terminal window will open. The first time it runs, it downloads some things automatically (~200MB) — this takes about a minute. After that, launches are instant.

Your browser will open automatically to the Sparx Solver page.

### Step 4 — Use It

1. Type your **school name** and pick it from the dropdown
2. Enter your Sparx **username** and **password**
3. Click **Log In**
4. You'll see your homework tasks listed — click **Solve** on any task
5. Watch it solve in real time

When you're done, close the terminal window to stop the server.

---

## Every Time After the First

Just double-click `start.command` (Mac) or `start.bat` (Windows). That's it. No terminal commands needed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `start.command` won't open on Mac | Right-click → Open → Open |
| "node is not recognized" | Restart your computer after installing Node.js |
| "Port 3000 already in use" | Close any other terminal windows running Sparx Solver |
| Login fails | Double-check your school name, username and password |
| Browser doesn't open | Go to [localhost:3000](http://localhost:3000) manually |

---

## Updating

To get the latest version:

**If you used Git:**
```
cd sparx-solver
git pull
```

**If you downloaded the ZIP:**
Download it again from the same link and replace the old folder.
