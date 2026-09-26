import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
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

// ---------- TOOL DECLARATIONS (new SDK format) ----------

const tools: any = [
  {
    functionDeclarations: [
      {
        name: "getCustomerInfo",
        description: "Look up a customer's order details by customer ID.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerId: { type: Type.STRING, description: "e.g. CUST001" },
          },
          required: ["customerId"],
        },
      },
      {
        name: "checkRefundPolicy",
        description:
          "Check whether an order is eligible for a refund based on order date, item condition, and sale status.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            orderDate: { type: Type.STRING, description: "YYYY-MM-DD" },
            condition: { type: Type.STRING },
            isSaleItem: { type: Type.BOOLEAN },
          },
          required: ["orderDate", "condition", "isSaleItem"],
        },
      },
      {
        name: "approveRefund",
        description: "Approve the refund once policy check has passed.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerId: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            reason: { type: Type.STRING },
          },
          required: ["customerId", "amount", "reason"],
        },
      },
      {
        name: "denyRefund",
        description: "Deny the refund with a clear reason, citing the failed policy rule.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerId: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ["customerId", "reason"],
        },
      },
    ],
  },
];

const SYSTEM_PROMPT = `You are a refund support agent for an e-commerce store.
Always follow this process:
1. Call getCustomerInfo to fetch the customer's order.
2. Call checkRefundPolicy using that order's orderDate, condition, and isSaleItem.
3. If eligible, call approveRefund. If not eligible, call denyRefund with the specific reason(s).
Never approve a refund without first checking the policy. Be concise and clear in your final reply to the customer.`;

// ---------- API ROUTE ----------

export async function POST(req: NextRequest) {
  const { message, customerId } = await req.json();

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const model = "gemini-2.5-flash";

  const logs: any[] = [];

  const chat = ai.chats.create({
    model:"gemini-3.8-flash",
    config: {
      tools,
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  let response = await chat.sendMessage({
    message: `Customer ID: ${customerId}. Message: ${message}`,
  });

  // Agent loop: keep executing tool calls until the model gives a final text answer
  for (let i = 0; i < 6; i++) {
    const call = response.functionCalls?.[0];
    if (!call) break;

    logs.push({ step: i + 1, tool: call.name, input: call.args });

    const toolFn = TOOL_MAP[call.name as string];
    const output = toolFn ? toolFn(call.args) : { error: "Unknown tool" };

    logs.push({ step: i + 1, tool: call.name, output });

    response = await chat.sendMessage({
      message: [
        {
          functionResponse: {
            name: call.name,
            response: output,
          },
        },
      ],
    });
  }

  const finalText = response.text;

  return NextResponse.json({ reply: finalText, logs });
}