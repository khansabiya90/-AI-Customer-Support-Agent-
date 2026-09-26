# AI Customer Support Agent — E-commerce Refund Automation

An AI-powered customer support agent built with **Next.js** that autonomously processes or denies e-commerce refund requests. The agent uses dynamic tool/function calling to look up customer data, validate refund requests against a strict policy document, and make an approve/deny decision — with full reasoning logs visible on an admin dashboard.

---

## ✨ Features

- **Customer Chat Interface** — Select a customer and chat with the AI agent to request a refund.
- **Admin Dashboard** — Real-time view of the agent's reasoning: which tools it called, what data it retrieved, and why it approved or denied the request.
- **Agent Loop (Function Calling)** — The LLM dynamically decides which tool to call next based on context, rather than following a hardcoded script.
- **Mock CRM Database** — 15 customer profiles with order details, purchase dates, prices, and item conditions.
- **Strict Refund Policy Engine** — A policy document the agent consults and cites when approving or denying a request.

---

## 🏗️ Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│  Customer Chat   │  --->   │   /api/agent (route)  │
│    (Frontend)     │  <---   │   Agent Loop (LLM)     │
└─────────────────┘         └──────────┬────────────┘
                                        │ tool calls
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
            getCustomerInfo    checkRefundPolicy    approveRefund /
             (customers.json)      (policy.md)        denyRefund
                                                             │
                                                             ▼
                                              ┌───────────────────────┐
                                              │   Admin Dashboard      │
                                              │  (reasoning log feed)  │
                                              └───────────────────────┘
```

### Agent Loop

The backend (`app/api/agent/route.ts`) implements a raw function-calling loop:

1. User sends a refund request via chat.
2. The LLM is given a system prompt describing its role and a set of tools.
3. The LLM decides, step by step, which tool to call:
   - `getCustomerInfo(customerId)` → fetches order/customer data from the mock CRM.
   - `checkRefundPolicy(orderDetails)` → validates the order against the refund policy rules (30-day window, used items, sale items, digital goods, etc.).
   - `approveRefund(...)` / `denyRefund(...)` → finalizes the decision with a reason.
4. Every step (tool call, tool result, and the agent's reasoning) is streamed/logged and shown live on the **Admin Dashboard**.
5. The final decision + explanation is returned to the customer in the chat.

This loop-based design (rather than a single prompt-response) is what lets the agent handle edge cases — e.g., it may call `getCustomerInfo` first, realize it needs the purchase date, then call `checkRefundPolicy`, and only then decide to approve or deny.

---

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   └── agent/route.ts       # Agent backend: tool definitions + function-calling loop
│   ├── page.tsx                 # Customer chat UI
│   └── admin/page.tsx           # Admin dashboard UI (reasoning logs)
├── data/
│   ├── customers.json           # 15 mock customer/order profiles
│   └── policy.md                # Strict refund policy document
├── lib/
│   └── tools.ts                 # Tool implementations (getCustomerInfo, checkRefundPolicy, etc.)
├── README.md
└── package.json
```

*(Adjust this tree to match your actual file names/paths before publishing.)*

---

## 🧠 Refund Policy Rules (Summary)

The agent enforces the following rules from `data/policy.md`:

- Refunds are only valid within **30 days** of purchase.
- **Used/opened** items are not eligible for a refund.
- **Sale/discounted** items are non-refundable.
- **Digital goods** are non-refundable once accessed/downloaded.
- All other standard orders within policy are approved.

The agent always cites the specific rule it used to approve or deny a request — this is visible in both the chat response and the admin log.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- An OpenAI (or other LLM provider) API key

### Installation

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
```

### Environment Variables

Create a `.env.local` file in the root:

```
OPENAI_API_KEY=your_api_key_here
```

### Run the app

```bash
npm run dev
```

Visit:
- Customer chat: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin`

---

## 🧪 Example Test Cases

| Customer ID | Scenario | Expected Result |
|---|---|---|
| CUST001 | Order within 30 days, unused, not on sale | ✅ Approved |
| CUST002 | Order placed 45+ days ago | ❌ Denied — outside 30-day window |
| CUST003 | Item marked as "used"/opened | ❌ Denied — used item policy |
| CUST00x | Item purchased on sale | ❌ Denied — sale item policy |

*(Update this table with the exact customer IDs and outcomes you tested for your demo video.)*

---

## 🎙️ Voice Integration

Voice interaction (via OpenAI Realtime API / ElevenLabs / LiveKit) was **not implemented** in this submission due to time constraints within the 3-day deadline. The architecture is designed to support it as a future extension — the same agent loop and tool set could be wired to a voice pipeline by:
1. Converting speech-to-text at the input layer.
2. Feeding the transcribed text into the existing `/api/agent` loop.
3. Converting the agent's text response to speech (TTS) before returning it to the caller.

---

## 📹 Demo Video

A full walkthrough (7–10 min) covering:
- A standard refund approval
- A policy-violation denial (edge case)
- Code walkthrough of the agent loop and tool orchestration
- Live view of the admin dashboard's reasoning logs

🔗 **[Watch the demo video here]** *(insert Loom/Google Drive link)*

---

## 📌 Notes / Known Limitations

- Data is mocked (`customers.json`, `policy.md`) — no real database or payment gateway is connected.
- Voice pipeline is a bonus feature and was skipped for this submission; see above for the planned integration approach.
- Error handling/retries in the agent loop are logged to the admin dashboard for transparency (see video for a live example).