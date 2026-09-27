"use client";

import { useState } from "react";

export default function Home() {
  const [customerId, setCustomerId] = useState("CUST001");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "agent"; text: string }[]
  >([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!message.trim()) return;

    const userMsg = message;
    setChatHistory((prev) => [...prev, { role: "user", text: userMsg }]);
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, customerId }),
      });
      const data = await res.json();

      setChatHistory((prev) => [...prev, { role: "agent", text: data.reply }]);
      setLogs((prev) => [...prev, ...data.logs]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: "agent", text: "Something went wrong. Check the server logs." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Customer Chat Panel */}
      <div style={{ flex: 1, padding: 20, borderRight: "1px solid #ccc", display: "flex", flexDirection: "column" }}>
        <h2>Customer Support Chat</h2>

        <label style={{ marginBottom: 8 }}>
          Customer ID:{" "}
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {Array.from({ length: 15 }, (_, i) => `CUST${String(i + 1).padStart(3, "0")}`).map(
              (id) => (
                <option key={id} value={id} >
                  {id}
                </option>
              )
            )}
          </select>
        </label>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: "#fafafa",
          }}
        >
          {chatHistory.length === 0 && (
            <p style={{ color: "#888" }}>
              Try: "I want a refund for my order" or "Can I return my item?"
            </p>
          )}
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                textAlign: msg.role === "user" ? "right" : "left",
                margin: "8px 0",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: msg.role === "user" ? "#0070f3" : "#e5e5e5",
                  color: msg.role === "user" ? "white" : "black",
                  maxWidth: "80%",
                }}
              >
                {msg.text}
              </span>
            </div>
          ))}
          {loading && <p style={{ color: "#888" }}>Agent is thinking...</p>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type your message..."
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{ padding: "10px 20px", borderRadius: 8, background: "#0070f3", color: "white", border: "none" }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Admin Reasoning Log Panel */}
      <div style={{ flex: 1, padding: 20, background: "#111", color: "#0f0", overflowY: "auto", fontFamily: "monospace" }}>
        <h2 style={{ color: "white" }}>Admin: Agent Reasoning Logs</h2>
        {logs.length === 0 && <p style={{ color: "#888" }}>No activity yet.</p>}
        {logs.map((log, i) => (
          <pre key={i} style={{ whiteSpace: "pre-wrap", borderBottom: "1px solid #333", paddingBottom: 8, marginBottom: 8 }}>
            {JSON.stringify(log, null, 2)}
          </pre>
        ))}
      </div>
    </div>
  );
}