# Veracity: AI Fact-Checking Extension

Veracity is a privacy-first Chrome Extension that audits news articles in real-time. It leverages the **Perplexity AI API** to analyze web content, cross-reference claims against live data, and highlight misinformation directly in the browser DOM.

![Version](https://img.shields.io/badge/version-1.0.1-blue)
![Tech](https://img.shields.io/badge/tech-React%20%7C%20TypeScript%20%7C%20Vite-green)

## 🚀 Key Features

* **Real-Time Analysis:** Scans article text and queries live web indexes (via Perplexity) to verify statistics and dates.
* **DOM Injection:** Dynamically highlights disputed claims (Red) and verified facts (Green) without breaking page layout.
* **Privacy-First (BYOK):** "Bring Your Own Key" architecture. API keys and history are stored locally in `chrome.storage.sync` and never sent to a backend server.
* **Manifest V3:** Fully compliant with Google's latest security architecture, using Service Workers and strict content security policies.

## 🛠 Tech Stack

* **Frontend:** React, TypeScript, Tailwind CSS
* **Build Tool:** Vite
* **AI Integration:** Perplexity AI (Online LLM)
* **Browser API:** Chrome Extensions API (Manifest V3), Storage API, Scripting API

## 📦 Installation (Developer Mode)

1.  Clone the repo:
    ```bash
    git clone [https://github.com/DY0810/Veracity-Extension.git](https://github.com/DY0810/Veracity-Extension.git)
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```
4.  Load into Chrome:
    * Go to `chrome://extensions`
    * Enable "Developer Mode" (top right)
    * Click "Load Unpacked" -> Select the `dist` folder.

## 📄 License
Distributed under the MIT License.
