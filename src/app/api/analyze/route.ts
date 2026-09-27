import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenAIProvider } from "@/lib/openai-provider";
import { GeminiProvider } from "@/lib/gemini-provider";
import type { ConversationMessage } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 120;

const openAIProvider = new OpenAIProvider();
const geminiProvider = new GeminiProvider();
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function getProviderName() {
    return process.env.AI_PROVIDER?.toLowerCase() === "openai" ? "openai" : "gemini";
}

function getProvider() {
    return getProviderName() === "openai" ? openAIProvider : geminiProvider;
}

export async function GET() {
    const provider = getProviderName();
    const configured = provider === "gemini"
        ? Boolean(process.env.GEMINI_API_KEY)
        : Boolean(process.env.OPENAI_API_KEY);
    return NextResponse.json({ provider, configured });
}

export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const image = form.get("image");
        const question = z.string().trim().min(3).max(2000).safeParse(form.get("question"));
        const historyEntry = form.get("history");

        if (image === null || typeof image === "string") {
            return NextResponse.json({ error: "Choose an image to analyze." }, { status: 400 });
        }
        if (!question.success) {
            return NextResponse.json({ error: "Your question must be between 3 and 2000 characters." }, { status: 400 });
        }
        let history: ConversationMessage[] = [];
        if (typeof historyEntry === "string" && historyEntry.length > 0) {
            let parsedHistory: unknown;
            try {
                parsedHistory = JSON.parse(historyEntry);
            } catch {
                return NextResponse.json({ error: "The conversation history is invalid." }, { status: 400 });
            }
            const historyResult = z.array(z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1).max(8000),
            })).max(12).safeParse(parsedHistory);
            if (!historyResult.success) {
                return NextResponse.json({ error: "The conversation history is invalid or too long." }, { status: 400 });
            }
            history = historyResult.data;
        } else if (historyEntry !== null) {
            return NextResponse.json({ error: "The conversation history is invalid." }, { status: 400 });
        }
        if (!allowedTypes.has(image.type)) {
            return NextResponse.json({ error: "Image format must be JPEG, PNG, WebP, or GIF." }, { status: 415 });
        }
        if (image.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: "Image size must be 10 MB or less." }, { status: 413 });
        }

        const bytes = Buffer.from(await image.arrayBuffer());
        const imageDataUrl = `data:${image.type};base64,${bytes.toString("base64")}`;
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                try {
                    const result = await getProvider().analyzeImage(
                        { imageDataUrl, question: question.data, history },
                        (text) => send({ type: "delta", text }),
                    );
                    send({ type: "result", result });
                } catch (error) {
                    const message = error instanceof Error ? error.message : "An unknown error occurred.";
                    send({ type: "error", error: message });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        const status = message.includes("API_KEY") ? 503 : 502;
        return NextResponse.json({ error: message }, { status });
    }
}
