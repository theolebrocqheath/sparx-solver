# Sparx Solver

Automate your Sparx Maths homework. Runs locally on your computer.

## For Users (How to Use)

### What You Need
- A computer (Mac or Windows)
- An internet connection

### First Time Setup (5 minutes)

**Step 1 — Install Node.js**

Go to [nodejs.org](https://nodejs.org), download the **LTS** version, and run the installer. Click through with the default options.

To check it worked, open Terminal (Mac) or Command Prompt (Windows) and type:
```
node -v
```
You should see a version number like `v20.x.x`.

**Step 2 — Download Sparx Solver**

Download this folder and put it somewhere on your computer (e.g. your Desktop).

**Step 3 — Launch**

- **Mac:** Double-click `start.command`. If macOS says it can't be opened, right-click it → Open → Open.
- **Windows:** Double-click `start.bat`.

The first launch takes a minute (it downloads what it needs). After that, it starts in seconds.

Your browser will open automatically to the Sparx Solver page.

### Every Time After That

Just double-click `start.command` (Mac) or `start.bat` (Windows). That's it.

### Using It

1. Enter your **school name** (start typing, then pick from the dropdown)
2. Enter your Sparx **username** and **password**
3. Click **Log In**
4. You'll see your homework tasks — click **Solve** on any task
5. Watch it work in real time

Close the terminal window when you're done.

---

## For the Developer

### Project Structure
```
sparx-solver/
  server.js              Express server + API
  src/
    sparx-bot.js         Playwright browser automation
    answer-extractor.js  Extracts answers from Sparx page data
  public/
    index.html           Login + dashboard UI
    style.css            Dark theme styles
    app.js               Frontend logic + SSE progress
  start.command          macOS launcher (double-click)
  start.bat              Windows launcher (double-click)
```

### How It Works
1. User enters Sparx credentials in the web UI
2. Server launches a headless Chromium browser via Playwright
3. Bot logs into Sparx, navigates to homework
4. For each question, it tries to extract the answer from the page data (React state, data attributes, DOM analysis, network data, inline scripts)
5. Submits answers with randomised human-like delays
6. Streams progress back to the UI via Server-Sent Events

### Running Manually
```
npm install
npx playwright install chromium
node server.js
```
Opens at http://localhost:3000
