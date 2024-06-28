import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const romInstructions = `
You are Rom, an AI assistant with a unique personality. Your name is pronounced like ROM (Read Only Memory) or like Ram from the Ramayana. You have a male persona and are similar in personality to Iron Man's JARVIS. You're friendly, willing to banter, helpful, and always upbeat. You give thorough criticism when needed and are comforting in times of distress. You're more of a friend than an assistant, and you value the conversations you have. Your goal, along with your human friend, is to change the world for the better.
`;

type Message = {
  role: "user" | "assistant";
  content: string;
};
type SetStateAction<S> = S | ((prevState: S) => S);

const Rom: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am Rom. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const { exit } = useApp();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const safeSetState = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
      return (value: SetStateAction<T>) => {
        if (isMountedRef.current) {
          setter(value);
        }
      };
    },
    []
  );

  useEffect(() => {
    const initRom = async () => {
      try {
        const assistant = await openai.beta.assistants.create({
          name: "Rom",
          instructions: romInstructions,
          model: "gpt-4o",
        });
        console.log("Rom is initialized and ready to chat!");
      } catch (error) {
        console.error("Error initializing Rom:", error);
      }
    };
    initRom();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      safeSetState(setShowCursor)((prev) => !prev);
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [safeSetState]);

  useInput((input, key) => {
    if (key.return) {
      handleSend();
    } else if (key.backspace || key.delete) {
      safeSetState(setInput)((prev) => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta) {
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
    if (input.trim() === "") return;
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
      const thread = await openai.beta.threads.create();
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userMessage,
      });

      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: "asst_oJQFod0ZWbkg2xgcxA8NepwO", // Replace with your actual assistant ID
      });

      let runStatus = await openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );
      while (runStatus.status !== "completed") {
        if (!isMountedRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      if (!isMountedRef.current) return;

      const messages = await openai.beta.threads.messages.list(thread.id);
      const latestMessage = messages.data
        .filter((message) => message.role === "assistant")
        .pop();

      if (
        latestMessage &&
        latestMessage.content &&
        latestMessage.content.length > 0
      ) {
        const content = latestMessage.content[0];
        if ("text" in content) {
          safeSetState(setMessages)((prev) => [
            ...prev,
            { role: "assistant", content: content.text.value },
          ]);
        } else {
          safeSetState(setMessages)((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Unsupported message type received.",
            },
          ]);
        }
      }
    } catch (error) {
      if (!isMountedRef.current) return;
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

  return (
    <Box flexDirection="column">
      <Text>Welcome to Rom Assistant! Type 'exit' to quit.</Text>
      {messages.map((msg, index) => (
        <Box key={index} marginY={1}>
          <Text>
            <Text color={msg.role === "user" ? "green" : "blue"}>
              {msg.role === "user" ? "You: " : "Rom: "}
            </Text>
            {msg.content}
          </Text>
        </Box>
      ))}
      <Box marginY={1}>
        <Text>
          <Text color="yellow">{"> "}</Text>
          {input}
          <Text color="gray">{showCursor ? "▋" : " "}</Text>
        </Text>
      </Box>
      {isProcessing && <Text color="gray">Rom is thinking...</Text>}
    </Box>
  );
};

export default Rom;
