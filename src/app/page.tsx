"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ImagePlus, LoaderCircle, Mic, MicOff, RotateCcw, Sparkles, Upload, Volume2, X } from "lucide-react";
import type { AnalysisResult } from "@/lib/analysis-schema";
import { ImageAnnotation } from "@/components/image-annotation";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    result?: AnalysisResult | null;
};

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: SpeechResultEvent) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
};

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const [question, setQuestion] = useState("");
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [activeStep, setActiveStep] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [cameraSize, setCameraSize] = useState({ width: 4, height: 3 });
    const [listening, setListening] = useState(false);
    const [voiceSession, setVoiceSession] = useState(false);
    const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const cameraRequestRef = useRef<Promise<MediaStream> | null>(null);
    const voiceSessionRef = useRef(false);
    const analysisInFlightRef = useRef(false);
    const assistantSpeakingRef = useRef(false);
    const sessionDataRef = useRef({ file, cameraStream, conversation });
    const speakAnswerRef = useRef<(text: string) => void>(() => undefined);
    sessionDataRef.current = { file, cameraStream, conversation };

    useEffect(() => () => {
        cameraStream?.getTracks().forEach((track) => track.stop());
        recognitionRef.current?.stop();
    }, [cameraStream]);

    useEffect(() => {
        if (!file) {
            setPreview("");
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        const video = videoRef.current;
        if (video && cameraStream && video.srcObject !== cameraStream) {
            video.srcObject = cameraStream;
        }
    }, [cameraStream]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ block: "end" });
    }, [conversation, loading]);

    const chooseFile = (candidate?: File) => {
        if (!candidate) return;
        setError("");
        if (!ACCEPTED_TYPES.includes(candidate.type)) {
            setError("Choose a JPEG, PNG, WebP, or GIF image.");
            return;
        }
        if (candidate.size > MAX_FILE_SIZE) {
            setError("Image size must be 10 MB or less.");
            return;
        }
        cameraStream?.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
        setFile(candidate);
        setResult(null);
        setConversation([]);
    };

    async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            setError("This browser cannot access a live camera. Try uploading an image instead.");
            return;
        }
        try {
            cameraRequestRef.current ??= navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
            const stream = await cameraRequestRef.current;
            setError("");
            setCameraStream(stream);
        } catch {
            cameraRequestRef.current = null;
            setError("Could not start the camera. Check browser permissions and try again.");
        }
    }

    const captureFrame = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) {
            setError("The camera is not ready yet. Try again in a moment.");
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (!blob) {
            setError("Could not capture a camera frame. Please try again.");
            return;
        }
        setFile(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setResult(null);
        setError("");
    };

    const startVoiceRecognition = () => {
        if (!voiceSessionRef.current || recognitionRef.current || analysisInFlightRef.current || assistantSpeakingRef.current) return;
        const browserWindow = window as Window & {
            SpeechRecognition?: new () => SpeechRecognitionLike;
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
        if (!Recognition) {
            voiceSessionRef.current = false;
            setVoiceSession(false);
            setError("Speech recognition is not available in this browser. Type your question instead.");
            return;
        }
        const recognition = new Recognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results).map((item) => item[0]?.transcript ?? "").join(" ").trim();
            if (transcript) {
                setQuestion(transcript);
                void analyze(transcript);
            }
        };
        recognition.onerror = () => {
            setError("I could not access the microphone. Check browser permissions and try again.");
            voiceSessionRef.current = false;
            setVoiceSession(false);
        };
        recognition.onend = () => {
            recognitionRef.current = null;
            setListening(false);
            if (voiceSessionRef.current && !analysisInFlightRef.current && !assistantSpeakingRef.current) window.setTimeout(startVoiceRecognition, 300);
        };
        recognitionRef.current = recognition;
        setError("");
        setListening(true);
        recognition.start();
    };

    const toggleVoiceInput = () => {
        const next = !voiceSessionRef.current;
        voiceSessionRef.current = next;
        setVoiceSession(next);
        if (!next) {
            recognitionRef.current?.stop();
            recognitionRef.current = null;
            setListening(false);
            window.speechSynthesis?.cancel();
            return;
        }
        if (!cameraStream) void startCamera().then(startVoiceRecognition);
        else startVoiceRecognition();
    };

    const speakAnswer = (text: string) => {
        if (!("speechSynthesis" in window)) {
            setError("Spoken answers are not available in this browser.");
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        assistantSpeakingRef.current = true;
        utterance.onend = () => {
            assistantSpeakingRef.current = false;
            if (voiceSessionRef.current && !recognitionRef.current) startVoiceRecognition();
        };
        utterance.onerror = () => {
            assistantSpeakingRef.current = false;
            if (voiceSessionRef.current && !recognitionRef.current) startVoiceRecognition();
        };
        window.speechSynthesis.speak(utterance);
    };
    speakAnswerRef.current = speakAnswer;

    useEffect(() => {
        void startCamera();
    }, []);

    useEffect(() => {
        let mounted = true;
        void fetch("/api/analyze")
            .then((response) => {
                if (!response.ok) throw new Error("AI status check failed");
                return response.json() as Promise<{ configured?: boolean }>;
            })
            .then((status) => { if (mounted) setAiConfigured(status.configured === true); })
            .catch(() => { if (mounted) setAiConfigured(false); });
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!cameraStream) return;
        voiceSessionRef.current = true;
        setVoiceSession(true);
        speakAnswerRef.current("Welcome to Khobaib Live AI.");
    }, [cameraStream]);

    const analyze = async (spokenQuestion?: string) => {
        const userQuestion = (spokenQuestion ?? question).trim();
        const session = sessionDataRef.current;
        if ((!session.file && !session.cameraStream) || userQuestion.length < 3 || analysisInFlightRef.current) return;
        analysisInFlightRef.current = true;
        let analysisFile = session.file;
        const liveVideo = videoRef.current;
        if (session.cameraStream && liveVideo?.videoWidth && liveVideo.videoHeight) {
            const canvas = document.createElement("canvas");
            canvas.width = liveVideo.videoWidth;
            canvas.height = liveVideo.videoHeight;
            canvas.getContext("2d")?.drawImage(liveVideo, 0, 0);
            const frame = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
            if (!frame) {
                setError("Could not capture the current camera frame. Please try again.");
                analysisInFlightRef.current = false;
                return;
            }
            analysisFile = new File([frame], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        }
        if (!analysisFile) {
            analysisInFlightRef.current = false;
            return;
        }
        const history = session.conversation
            .filter((entry) => entry.content && entry.content !== "Looking at the live view…")
            .slice(-10)
            .map(({ role, content }) => ({ role, content }));

        const loadingMessage: ChatMessage = {
            role: "assistant",
            content: "Looking at the live view…",
            result: null,
        };

        setLoading(true);
        setError("");
        setQuestion("");
        setConversation((previous) => [...previous, { role: "user", content: userQuestion }, loadingMessage]);
        setResult(null);

        try {
            const form = new FormData();
            form.append("image", analysisFile);
            form.append("question", userQuestion);
            form.append("history", JSON.stringify(history));
            const response = await fetch("/api/analyze", { method: "POST", body: form });
            if (!response.ok) {
                const payload = await response.json() as { error?: string };
                throw new Error(payload.error || "Image analysis failed.");
            }
            if (!response.body) throw new Error("The AI response stream is unavailable.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let streamedText = "";
            let parsed: AnalysisResult | null = null;
            let streamError = "";
            const applyEvent = (block: string) => {
                const line = block.split("\n").find((entry) => entry.startsWith("data: "));
                if (!line) return;
                const event = JSON.parse(line.slice(6)) as
                    | { type: "delta"; text: string }
                    | { type: "result"; result: AnalysisResult }
                    | { type: "error"; error: string };
                if (event.type === "delta") {
                    streamedText += event.text;
                    setConversation((previous) => {
                        const next = [...previous];
                        const pendingIndex = next.findLastIndex((message) => message.role === "assistant" && !message.result);
                        if (pendingIndex >= 0) next[pendingIndex] = { ...next[pendingIndex], content: streamedText };
                        return next;
                    });
                } else if (event.type === "result") {
                    parsed = event.result;
                } else {
                    streamError = event.error;
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value, { stream: !done });
                const blocks = buffer.split("\n\n");
                buffer = blocks.pop() ?? "";
                blocks.forEach(applyEvent);
                if (done) break;
            }
            if (buffer.trim()) applyEvent(buffer);
            if (streamError) throw new Error(streamError);
            const parsedResult = parsed as AnalysisResult | null;
            if (!parsedResult) throw new Error("The AI response was incomplete. Please try again.");

            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: streamedText || parsedResult.answer,
                result: parsedResult,
            };

            setConversation((previous) => {
                const next = [...previous];
                const last = next[next.length - 1];
                if (last && last.role === "assistant" && !last.result) {
                    next[next.length - 1] = assistantMessage;
                    return next;
                }
                next.push(assistantMessage);
                return next;
            });
            setResult(parsedResult);
            setSelectedAnnotationId(parsedResult.annotations[0]?.id ?? null);
            setActiveStep(0);
            speakAnswer(parsedResult.answer);
        } catch (reason) {
            setConversation((previous) => previous.filter((message) => !(message.role === "assistant" && !message.result)));
            setError(reason instanceof Error ? reason.message : "Could not connect to the analysis service.");
        } finally {
            setLoading(false);
            analysisInFlightRef.current = false;
            if (voiceSessionRef.current && !assistantSpeakingRef.current && !recognitionRef.current) {
                window.setTimeout(startVoiceRecognition, 300);
            }
        }
    };

    const active = result?.steps[activeStep];
    const activeAnnotationId = selectedAnnotationId ?? active?.annotationId ?? result?.annotations[0]?.id;
    const goToStep = (index: number) => {
        if (!result) return;
        const next = Math.max(0, Math.min(index, result.steps.length - 1));
        setActiveStep(next);
        setSelectedAnnotationId(result.steps[next].annotationId ?? null);
    };

    return (
        <main className={`app-shell${cameraStream ? " has-live-camera" : ""}`} dir="ltr">
            <header className="topbar">
                <a className="brand" href="#" aria-label="SeeGuide home">
                    <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
                    <span>SeeGuide</span>
                    <span className="brand-divider" />
                    <span className="brand-caption">LIVE VISUAL ASSISTANT</span>
                </a>
                <div className="topbar-status"><span className="status-dot" /> Visual assistant <ChevronDown size={14} /></div>
            </header>

            <div className="workspace">
                <section className="work-area" aria-label="Live visual assistant">
                    <div className="work-heading">
                        <div>
                            <p className="eyebrow">SEE IT. UNDERSTAND IT. FIX IT.</p>
                            <h1>Show me the problem.<br /><span>We’ll work through it together.</span></h1>
                        </div>
                        <div className="privacy-note"><span className="privacy-lock">✳</span> Camera frames are sent only when you ask</div>
                    </div>

                    {cameraStream ? (
                        <div className="live-camera-stage" style={{ aspectRatio: `${cameraSize.width} / ${cameraSize.height}` }}>
                            <h1 className="camera-overlay-title">Linux Camera &amp; AI Overlay</h1>
                            <video ref={videoRef} onLoadedMetadata={(event) => setCameraSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} autoPlay muted playsInline />
                            {loading && <LoaderCircle className="camera-analysis-spinner spin" size={38} aria-label="Analyzing live camera frame" />}
                            {result?.annotations.map((annotation, index) => <button key={annotation.id} className={`annotation-box live-annotation${annotation.id === activeAnnotationId ? " is-active" : ""}`} type="button" style={{ left: `${annotation.x / 10}%`, top: `${annotation.y / 10}%`, width: `${annotation.width / 10}%`, height: `${annotation.height / 10}%` }} onClick={() => { setSelectedAnnotationId(annotation.id); const stepIndex = result.steps.findIndex((step) => step.annotationId === annotation.id); if (stepIndex >= 0) setActiveStep(stepIndex); }} aria-label={`Detected area ${index + 1}: ${annotation.explanation}`}><span className="live-annotation-label"><span aria-hidden="true">⚠</span> Detected Area</span></button>)}
                            <div className="live-camera-tools"><span className="camera-assistant-status"><i /> <strong>AI Assistant:</strong> {aiConfigured === null ? "Checking AI connection…" : !aiConfigured ? "AI not connected. Get a free Gemini API key:" : loading ? "Analyzing frame…" : active ? active.description : listening ? "Listening. Tell me what you need help with." : error || "Welcome to Khobaib Live AI."}</span>{aiConfigured === false && <a className="gemini-key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>}<button className={`camera-control-button${voiceSession ? " is-active" : ""}`} type="button" onClick={toggleVoiceInput} aria-label={voiceSession ? "Stop voice conversation" : "Start voice conversation"} title={voiceSession ? "Stop voice conversation" : "Start voice conversation"}>{voiceSession ? <MicOff size={17} /> : <Mic size={17} />}</button><button className="camera-control-button" type="button" onClick={() => void captureFrame()} aria-label="Capture camera frame" title="Capture camera frame"><Camera size={17} /></button></div>
                        </div>
                    ) : !preview ? (
                        <div
                            className={`upload-stage${dragging ? " is-dragging" : ""}`}
                            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
                        >
                            <div className="stage-grain" />
                            <div className="upload-art" aria-hidden="true">
                                <div className="art-sheet"><div className="art-equation">x² + y² = ?</div><div className="art-line" /><div className="art-line short" /><div className="art-mark"><span>1</span></div></div>
                                <div className="art-spark spark-one">✳</div><div className="art-spark spark-two">·</div>
                            </div>
                            <div className="upload-copy">
                                <h2>Show me what you are working on</h2>
                                <p>Start a live camera conversation or upload an image to troubleshoot together.</p>
                            </div>
                            <div className="upload-actions">
                                <button className="button-primary" onClick={() => fileRef.current?.click()} type="button"><ImagePlus size={17} /> Upload image</button>
                                <button className="button-secondary" onClick={() => void startCamera()} type="button"><Camera size={17} /> Start live camera</button>
                            </div>
                            <div className="drop-foot"><Upload size={13} /> Drop an image here · JPG, PNG, WebP · up to 10 MB</div>
                        </div>
                    ) : (
                        <section className="image-panel" aria-label="Image and annotations">
                            <div className="image-panel-head">
                                <div className="image-file"><span className="file-icon"><ImagePlus size={15} /></span><span className="file-name">{file?.name}</span><span className="file-size">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ""}</span></div>
                                <div className="image-tools">
                                    {cameraStream && <button className="icon-button" type="button" onClick={() => void captureFrame()} title="Capture current frame" aria-label="Capture current frame"><Camera size={15} /></button>}
                                    <button className="icon-button" type="button" onClick={() => fileRef.current?.click()} title="Replace image" aria-label="Replace image"><RotateCcw size={15} /></button>
                                    <button className="icon-button" type="button" onClick={() => { setFile(null); setResult(null); setConversation([]); setSelectedAnnotationId(null); }} title="Remove image" aria-label="Remove image"><X size={16} /></button>
                                </div>
                            </div>
                            <div className="image-viewport">
                                <ImageAnnotation
                                    src={preview}
                                    alt="Image selected for analysis"
                                    annotations={result?.annotations ?? []}
                                    activeAnnotationId={activeAnnotationId}
                                    onSelect={(id) => {
                                        setSelectedAnnotationId(id);
                                        const linkedStep = result?.steps.findIndex((step) => step.annotationId === id) ?? -1;
                                        if (linkedStep >= 0) setActiveStep(linkedStep);
                                    }}
                                />
                                {result && result.annotations.length > 0 && <div className="map-legend"><span className="legend-pip" /> Relevant areas</div>}
                            </div>
                            <div className="image-panel-foot"><span><Check size={13} /> Image ready</span><span>Markers match the analyzed frame</span></div>
                        </section>
                    )}

                    <div className="prompt-wrap">
                        <label className="prompt-label" htmlFor="question">Ask about what you see</label>
                        <div className="prompt-box">
                            <textarea
                                id="question"
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void analyze(); }}
                                placeholder="What is wrong here, and how do I fix it?"
                                maxLength={2000}
                                rows={2}
                            />
                            <div className="prompt-bottom"><span className="prompt-hint">{question.length ? `${question.length} / 2000` : listening ? "Listening… speak naturally" : voiceSession ? "Live voice session is on" : "Start voice chat or type a question"}</span><div className="prompt-actions"><button className={`voice-button${listening ? " is-listening" : ""}`} type="button" onClick={toggleVoiceInput} aria-label={voiceSession ? "End live voice session" : "Start live voice session"} title={voiceSession ? "End live voice session" : "Start live voice session"}>{voiceSession ? <MicOff size={16} /> : <Mic size={16} />}</button><button className="analyze-button" type="button" onClick={() => void analyze()} disabled={(!file && !cameraStream) || question.trim().length < 3 || loading}>{loading ? <><LoaderCircle className="spin" size={16} /> Analyzing</> : <>Ask <ArrowLeft size={16} /></>}</button></div></div>
                        </div>
                    </div>

                    {error && <div className="error-banner" role="alert"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss message"><X size={15} /></button></div>}
                    {loading && <div className="loading-line"><span className="loading-pulse" /> Analyzing the live view…</div>}
                    {!preview && !cameraStream && <div className="starter-prompts"><span>Try asking:</span>{["What looks wrong here?", "How do I fix this?", "Point out the part I should check"].map((text) => <button key={text} type="button" onClick={() => setQuestion(text)}>{text} <ArrowDown size={12} /></button>)}</div>}
                </section>

                <aside className="answer-panel" aria-label="Live assistant conversation">
                    <div className="answer-header"><div className="answer-title"><span className="answer-icon"><Sparkles size={16} /></span><div><h2>Live assistant</h2><p>{conversation.length ? "Conversation in progress" : "Ready when you are"}</p></div></div><span className={`answer-state${conversation.length ? " done" : ""}`}>{conversation.length ? "LIVE" : "READY"}</span></div>

                    {conversation.length === 0 && !loading && <div className="answer-empty"><div className="empty-orbit"><div className="orbit-ring" /><span><Sparkles size={23} /></span></div><h3>Your guide is here</h3><p>Ask a question while showing the problem. I’ll point to the part we’re discussing.</p><div className="empty-steps"><span><b>1</b> Show the issue</span><i /><span><b>2</b> Find the part</span><i /><span><b>3</b> Fix it together</span></div></div>}

                    <div className="chat-thread">
                        {conversation.map((message, index) => (
                            <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}${message.role === "assistant" && !message.result && loading ? " pending" : ""}`}>
                                <div className="chat-role">{message.role === "user" ? "You" : "Guide"}</div>
                                <p>{message.content}</p>
                                {message.result && (
                                    <div className="chat-result">
                                        <div className="chat-mini">
                                            <span>Steps: {message.result.steps.length}</span>
                                            <span>Markers: {message.result.annotations.length}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setResult(message.result ?? null);
                                                setActiveStep(0);
                                                setSelectedAnnotationId(message.result?.annotations[0]?.id ?? null);
                                            }}
                                        >
                                            Show on camera
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {result && active && <div className="answer-content" key={activeStep}>
                        <div className="answer-summary"><span className="summary-label">QUICK ANSWER</span><p>{result.answer}</p><button className="speak-button" type="button" onClick={() => speakAnswer(result.answer)} aria-label="Read answer aloud" title="Read answer aloud"><Volume2 size={16} /></button></div>
                        {result.uncertainty && <div className="uncertainty-note"><AlertCircle size={15} /><span>{result.uncertainty}</span></div>}
                        <div className="steps-heading"><div><span className="steps-kicker">GUIDED TROUBLESHOOTING</span><h3>Step by step</h3></div><span className="step-count">{String(activeStep + 1).padStart(2, "0")} <i>/</i> {String(result.steps.length).padStart(2, "0")}</span></div>
                        <div className="step-progress" aria-label={`Step ${activeStep + 1} of ${result.steps.length}`}><span style={{ width: `${((activeStep + 1) / result.steps.length) * 100}%` }} /></div>
                        <div className="current-step"><span className="step-number">{String(activeStep + 1).padStart(2, "0")}</span><div><h4>{active.title}</h4><p>{active.description}</p></div></div>
                        {activeAnnotationId && result.annotations.find((item) => item.id === activeAnnotationId) && <div className="linked-region"><span className="region-mark">{result.annotations.findIndex((item) => item.id === activeAnnotationId) + 1}</span><p>{result.annotations.find((item) => item.id === activeAnnotationId)?.explanation}</p></div>}
                        <div className="step-nav"><button type="button" onClick={() => goToStep(activeStep - 1)} disabled={activeStep === 0}><ArrowRight size={15} /> Previous</button><span>{activeStep === result.steps.length - 1 ? "Guide complete" : "Keep going"}</span><button className="next-step" type="button" onClick={() => goToStep(activeStep + 1)} disabled={activeStep === result.steps.length - 1}>Next <ArrowLeft size={15} /></button></div>
                        <div className="annotation-list"><div className="annotation-list-title"><span>Camera markers</span><span>{result.annotations.length}</span></div>{result.annotations.length ? result.annotations.map((annotation, index) => <button key={annotation.id} className={`annotation-row${annotation.id === activeAnnotationId ? " selected" : ""}`} type="button" onClick={() => { setSelectedAnnotationId(annotation.id); const stepIndex = result.steps.findIndex((step) => step.annotationId === annotation.id); if (stepIndex >= 0) setActiveStep(stepIndex); }}><span className="annotation-index">{String(index + 1).padStart(2, "0")}</span><span>{annotation.explanation}</span><ArrowLeft size={14} /></button>) : <p className="no-annotations">No specific area could be confidently marked. The guidance is based on the whole view.</p>}</div>
                    </div>}
                    <div className="answer-footer"><span className="footer-spark">✳</span><span>Guidance is informational. Ask a qualified technician about hazardous repairs.</span></div>
                </aside>
            </div>

            <footer className="page-footer"><span>SeeGuide <i>·</i> Live visual troubleshooting</span><span>Understand what you see. Fix it with confidence.</span></footer>
            <input ref={fileRef} className="visually-hidden" type="file" accept={ACCEPTED_TYPES.join(",")} onChange={(event) => chooseFile(event.target.files?.[0])} />
            <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </main>
    );
}
