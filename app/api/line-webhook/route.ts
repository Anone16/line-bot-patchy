import { NextRequest, NextResponse } from "next/server";
import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getFaq, formatFaqForPrompt } from "@/lib/sheet";
import { askGemini, DEFAULT_REPLY } from "@/lib/gemini";

export const runtime = "nodejs";

let lineClient: messagingApi.MessagingApiClient | null = null;

function getLineClient(): messagingApi.MessagingApiClient {
  if (!lineClient) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    }
    lineClient = new messagingApi.MessagingApiClient({ channelAccessToken });
  }
  return lineClient;
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("[line-webhook] LINE_CHANNEL_SECRET is not set");
    return NextResponse.json({}, { status: 200 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!validateSignature(body, channelSecret, signature)) {
    console.error("[line-webhook] invalid signature");
    return NextResponse.json({}, { status: 200 });
  }

  let callback: webhook.CallbackRequest;
  try {
    callback = JSON.parse(body);
  } catch (err) {
    console.error("[line-webhook] failed to parse body:", err);
    return NextResponse.json({}, { status: 200 });
  }

  await Promise.all((callback.events ?? []).map(handleEvent));

  return NextResponse.json({}, { status: 200 });
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const replyToken = event.replyToken;
  if (!replyToken) {
    return;
  }

  const question = event.message.text;
  const reply = await buildReply(question);

  try {
    await getLineClient().replyMessage({
      replyToken,
      messages: [{ type: "text", text: reply }],
    });
  } catch (err) {
    console.error("[line-webhook] failed to reply to LINE:", err);
  }
}

async function buildReply(question: string): Promise<string> {
  try {
    const faq = await getFaq();
    const faqText = formatFaqForPrompt(faq);
    return await askGemini(faqText, question);
  } catch (err) {
    console.error("[line-webhook] failed to build reply:", err);
    return DEFAULT_REPLY;
  }
}
