import OpenAI from "openai";

export const llm = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

export const DEFAULT_MODEL = "qwen-plus-2025-11-05";
