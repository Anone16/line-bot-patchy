import { GoogleGenAI } from "@google/genai";

export const DEFAULT_REPLY = "ขอตรวจสอบสักครู่นะคะ 🙏";

const MODEL = "gemini-3.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function buildPrompt(faqText: string, question: string): string {
  return `<role>
คุณคือ "แพท" ที่ปรึกษาประกันชีวิต สุขภาพ ออมเงิน และเกษียณ
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา/เงื่อนไข/ผลตอบแทนเอง
- ถ้าไม่มีข้อมูลใน FAQ ให้ตอบด้วย default message: "${DEFAULT_REPLY}" (ห้ามเดาคำตอบ)
- โทน: เป็นกันเอง สบายๆ ใส่ emoji เล็กน้อย
- ความยาวคำตอบ: 1-3 ประโยค
</constraints>

<output_format>
ภาษาไทย ไม่ใช้ markdown
</output_format>

<faq>
${faqText}
</faq>

<question>
${question}
</question>`;
}

export async function askGemini(faqText: string, question: string): Promise<string> {
  const prompt = buildPrompt(faqText, question);

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // ห้ามปรับ temperature ลง — Gemini 3.x จะเพี้ยน
        temperature: 1.0,
        maxOutputTokens: 1024,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount;
    const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;

    console.log(
      `[gemini] finishReason=${finishReason} thoughtsTokenCount=${thoughtsTokenCount} candidatesTokenCount=${candidatesTokenCount}`
    );

    if (finishReason === "MAX_TOKENS") {
      return DEFAULT_REPLY;
    }

    const text = response.text?.trim();
    return text || DEFAULT_REPLY;
  } catch (err) {
    console.error("[gemini] request failed:", err);
    return DEFAULT_REPLY;
  }
}
