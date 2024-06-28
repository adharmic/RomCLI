"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const openai_1 = __importDefault(require("openai"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const romInstructions = `
You are Rom, an AI assistant with a unique personality. Your name is pronounced like ROM (Read Only Memory) or like Ram from the Ramayana. You have a male persona and are similar in personality to Iron Man's JARVIS. You're friendly, willing to banter, helpful, and always upbeat. You give thorough criticism when needed and are comforting in times of distress. You're more of a friend than an assistant, and you value the conversations you have. Your goal, along with your human friend, is to change the world for the better.
`;
const ASSISTANT_ID_FILE = path_1.default.join(__dirname, "rom_assistant_id.txt");
const Rom = () => {
    const [messages, setMessages] = (0, react_1.useState)([
        {
            role: "assistant",
            content: "Hello! I am Rom. How can I assist you today?",
        },
    ]);
    const [input, setInput] = (0, react_1.useState)("");
    const [isProcessing, setIsProcessing] = (0, react_1.useState)(false);
    const [showCursor, setShowCursor] = (0, react_1.useState)(true);
    const [assistantId, setAssistantId] = (0, react_1.useState)(null);
    const { exit } = (0, ink_1.useApp)();
    const intervalRef = (0, react_1.useRef)(null);
    const abortControllerRef = (0, react_1.useRef)(null);
    const isMountedRef = (0, react_1.useRef)(true);
    const safeSetState = (0, react_1.useCallback)((setter) => {
        return (value) => {
            if (isMountedRef.current) {
                setter(value);
            }
        };
    }, []);
    (0, react_1.useEffect)(() => {
        const loadOrCreateAssistant = async () => {
            try {
                const id = await promises_1.default.readFile(ASSISTANT_ID_FILE, "utf-8");
                setAssistantId(id.trim());
                console.log("Rom assistant loaded with ID:", id.trim());
            }
            catch (error) {
                console.log("No existing Rom assistant found. One will be created when needed.");
            }
        };
        loadOrCreateAssistant();
    }, []);
    const createAssistant = async () => {
        const assistant = await openai.beta.assistants.create({
            name: "Rom",
            instructions: romInstructions,
            model: "gpt-4o",
        });
        await promises_1.default.writeFile(ASSISTANT_ID_FILE, assistant.id);
        setAssistantId(assistant.id);
        console.log("New Rom assistant created with ID:", assistant.id);
        return assistant.id;
    };
    (0, react_1.useEffect)(() => {
        intervalRef.current = setInterval(() => {
            safeSetState(setShowCursor)((prev) => !prev);
        }, 500);
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [safeSetState]);
    (0, ink_1.useInput)((input, key) => {
        if (key.return) {
            handleSend();
        }
        else if (key.backspace || key.delete) {
            safeSetState(setInput)((prev) => prev.slice(0, -1));
        }
        else if (!key.ctrl && !key.meta) {
            safeSetState(setInput)((prev) => prev + input);
        }
    });
    const cleanup = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        isMountedRef.current = false;
    };
    const handleSend = async () => {
        if (input.trim() === "")
            return;
        if (input.trim() === "exit") {
            cleanup();
            exit();
        }
        safeSetState(setIsProcessing)(true);
        const userMessage = input.trim();
        safeSetState(setMessages)((prev) => [
            ...prev,
            { role: "user", content: userMessage },
        ]);
        safeSetState(setInput)("");
        abortControllerRef.current = new AbortController();
        try {
            if (!assistantId) {
                await createAssistant();
            }
            const thread = await openai.beta.threads.create();
            await openai.beta.threads.messages.create(thread.id, {
                role: "user",
                content: userMessage,
            });
            const run = await openai.beta.threads.runs.create(thread.id, {
                assistant_id: assistantId || "", // Replace with your actual assistant ID
            });
            let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            while (runStatus.status !== "completed") {
                if (!isMountedRef.current)
                    return;
                await new Promise((resolve) => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            }
            if (!isMountedRef.current)
                return;
            const messages = await openai.beta.threads.messages.list(thread.id);
            const latestMessage = messages.data
                .filter((message) => message.role === "assistant")
                .pop();
            if (latestMessage &&
                latestMessage.content &&
                latestMessage.content.length > 0) {
                const content = latestMessage.content[0];
                if ("text" in content) {
                    safeSetState(setMessages)((prev) => [
                        ...prev,
                        { role: "assistant", content: content.text.value },
                    ]);
                }
                else {
                    safeSetState(setMessages)((prev) => [
                        ...prev,
                        {
                            role: "assistant",
                            content: "Unsupported message type received.",
                        },
                    ]);
                }
            }
        }
        catch (error) {
            if (!isMountedRef.current)
                return;
            console.error("Error:", error);
            safeSetState(setMessages)((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Sorry, I encountered an error. Please try again.",
                },
            ]);
        }
        safeSetState(setIsProcessing)(false);
    };
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
        react_1.default.createElement(ink_1.Text, null, "Welcome to Rom Assistant! Type 'exit' to quit."),
        messages.map((msg, index) => (react_1.default.createElement(ink_1.Box, { key: index, marginY: 1 },
            react_1.default.createElement(ink_1.Text, null,
                react_1.default.createElement(ink_1.Text, { color: msg.role === "user" ? "red" : "blue" }, msg.role === "user" ? "Adi: " : "Rom: "),
                msg.content)))),
        react_1.default.createElement(ink_1.Box, { marginY: 1 },
            react_1.default.createElement(ink_1.Text, null,
                react_1.default.createElement(ink_1.Text, { color: "yellow" }, "> "),
                input,
                react_1.default.createElement(ink_1.Text, { color: "gray" }, showCursor ? "▋" : " "))),
        isProcessing && react_1.default.createElement(ink_1.Text, { color: "gray" }, "Rom is thinking...")));
};
exports.default = Rom;
