import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import customers from "../../data/customers.json";

// ---------- TOOLS (functions the agent can call) ----------

function getCustomerInfo({ customerId }: { customerId: string }) {
  const customer = customers.find((c) => c.customerId === customerId);
  if (!customer) return { found: false, message: "Customer not found." };
  return { found: true, customer };
}

function checkRefundPolicy({
  orderDate,
  condition,
  isSaleItem,
}: {
  orderDate: string;
  condition: string;
  isSaleItem: boolean;
}) {
  const today = new Date("2026-09-25"); // fixed "today" for demo consistency
  const order = new Date(orderDate);
  const daysSinceOrder = Math.floor(
    (today.getTime() - order.getTime()) / (1000 * 60 * 60 * 24)
  );

  const reasons: string[] = [];
  if (daysSinceOrder > 30) {
    reasons.push(`Order was placed ${daysSinceOrder} days ago (limit is 30 days).`);
  }
  if (isSaleItem) {
    reasons.push("Item was purchased on sale/clearance — final sale, non-refundable.");
  }
  if (["used", "opened", "worn", "downloaded"].includes(condition)) {
    reasons.push(`Item condition is "${condition}", which is not eligible for refund.`);
  }

  return {
    eligible: reasons.length === 0,
    daysSinceOrder,
    reasons,
  };
}

function approveRefund({
  customerId,
  amount,
  reason,
}: {
  customerId: string;
  amount: number;
  reason: string;
}) {
  return {
    status: "approved",
    customerId,
    amount,
    reason,
    message: `Refund of ₹${amount} approved for ${customerId}.`,
  };
}

function denyRefund({ customerId, reason }: { customerId: string; reason: string }) {
  return {
    status: "denied",
    customerId,
    reason,
    message: `Refund denied for ${customerId}: ${reason}`,
  };
}

const TOOL_MAP: Record<string, (args: any) => any> = {
  getCustomerInfo,
  checkRefundPolicy,
  approveRefund,
  denyRefund,
};

// ---------- TOOL DECLARATIONS (OpenAI-compatible format, used by Groq) ----------

const tools: any = [
  {
    type: "function",
    function: {
      name: "getCustomerInfo",
      description: "Look up a customer's order details by customer ID.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "e.g. CUST001" },
        },
        required: ["customerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkRefundPolicy",
      description:
        "Check whether an order is eligible for a refund based on order date, item condition, and sale status.",
      parameters: {
        type: "object",
        properties: {
          orderDate: { type: "string", description: "YYYY-MM-DD" },
          condition: { type: "string" },
          isSaleItem: { type: "boolean" },
        },
        required: ["orderDate", "condition", "isSaleItem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approveRefund",
      description: "Approve the refund once policy check has passed.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          amount: { type: "number" },
          reason: { type: "string" },
        },
        required: ["customerId", "amount", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "denyRefund",
      description: "Deny the refund with a clear reason, citing the failed policy rule.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["customerId", "reason"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a refund support agent for an e-commerce store.
Always follow this process:
1. Call getCustomerInfo to fetch the customer's order.
2. Call checkRefundPolicy using that order's orderDate, condition, and isSaleItem.
3. If eligible, call approveRefund. If not eligible, call denyRefund with the specific reason(s).
Never approve a refund without first checking the policy. Be concise and clear in your final reply to the customer.`;

// ---------- RETRY HELPER (handles transient rate-limit / server errors) ----------

async function callWithRetry(
  groq: Groq,
  messages: any[],
  logs: any[],
  maxRetries = 3
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages,
        tools,
        tool_choice: "auto",
      });
    } catch (err: any) {
      const isRetryable = err?.status === 429 || err?.status === 503;

      logs.push({
        type: "error",
        attempt,
        message: isRetryable
          ? `Rate limited / overloaded (${err?.status}) — retrying...`
          : `Unexpected error: ${err?.message || err}`,
      });

      if (!isRetryable || attempt === maxRetries) throw err;

      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

// ---------- API ROUTE ----------

export async function POST(req: NextRequest) {
  const { message, customerId } = await req.json();

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY as string });

  const logs: any[] = [];
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Customer ID: ${customerId}. Message: ${message}` },
  ];

  let completion;
  try {
    completion = await callWithRetry(groq, messages, logs);
  } catch (err: any) {
    logs.push({ type: "fatal_error", message: "Gave up after retries." });
    return NextResponse.json(
      { reply: "Our agent is currently overloaded. Please try again shortly.", logs },
      { status: 200 }
    );
  }

  // Agent loop: keep executing tool calls until the model gives a final text answer
  for (let i = 0; i < 6; i++) {
    const responseMessage = completion.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // final answer reached
      return NextResponse.json({ reply: responseMessage.content, logs });
    }

    messages.push(responseMessage);

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      logs.push({ step: i + 1, tool: name, input: args });

      const toolFn = TOOL_MAP[name];
      const output = toolFn ? toolFn(args) : { error: "Unknown tool" };

      logs.push({ step: i + 1, tool: name, output });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      });
    }

    try {
      completion = await callWithRetry(groq, messages, logs);
    } catch (err: any) {
      logs.push({ type: "fatal_error", message: "Gave up after retries mid-loop." });
      return NextResponse.json(
        { reply: "Our agent hit a repeated error while processing your request. Please try again shortly.", logs },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({
    reply: "The agent could not reach a final decision in time. Please try again.",
    logs,
  });
}