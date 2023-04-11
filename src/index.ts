import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import { downloadVoiceFile } from "./lib/downloadVoiceFile";
import { postToWhisper } from "./lib/postToWhisper";
import { textToSpeech } from "./lib/htApi";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { Model as ChatModel } from "./models/chat";
import { Model as ChatWithTools } from "./models/chatWithTools";
import { healthcheck } from "./lib/healthcheck";

const workDir = "./tmp";
const telegramToken = process.env.TELEGRAM_TOKEN!;

const bot = new Telegraf(telegramToken);
let model = new ChatWithTools();

if (!existsSync(workDir)) {
  mkdirSync(workDir);
}

bot.start((ctx) => {
  ctx.reply("GREETINGS FELLOW HUMAN\n\nI'm a GPT-3.5 language model. I can google and I understand voice messages. Ask me anything");
});

bot.help((ctx) => {
  ctx.reply("I'm a GPT-3.5 language model. I can google and I understand voice messages. Ask me anything");
});

bot.on("voice", async (ctx) => {
  const voice = ctx.message.voice;
  await ctx.sendChatAction("typing");

  const localFilePath = await downloadVoiceFile(workDir, voice.file_id, bot);
  const transcription = await postToWhisper(model.openai, localFilePath);

  await ctx.reply(`Transcription: ${transcription}`);
  await ctx.sendChatAction("typing");

  let response;
  try {
    response = await model.call(transcription);
  } catch (error) {
    console.log(error);
    await ctx.reply(
      "Whoops! There was an error while talking to OpenAI. See logs for details."
    );
  }

  console.log(response);

  await ctx.reply(response);

  try {
    const responseTranscriptionPath = await textToSpeech(response);
    await ctx.sendChatAction("typing");
    await ctx.replyWithVoice({
      source: createReadStream(responseTranscriptionPath),
      filename: localFilePath,
    });
  } catch (error) {
    console.log(error);
    await ctx.reply(
      "Whoops! There was an error while synthesizing the response via play.ht. See logs for details."
    );
  }
});

bot.on("message", async (ctx) => {
  const text = (ctx.message as any).text;

  if (!text) {
    ctx.reply("Please send a text message.");
    return;
  }

  console.log("Input: ", text);

  await ctx.sendChatAction("typing");
  try {
    const response = await model.call(text);

    await ctx.reply(response);
  } catch (error) {
    console.log(error);

    const message = JSON.stringify(
      (error as any)?.response?.data?.error ?? "Unable to extract error"
    );

    console.log({ message });

    await ctx.reply(
      "Whoops! There was an error while talking to OpenAI. Error: " + message
    );
  }
});

bot.launch().then(() => {
  console.log("Bot launched");
  healthcheck();
});

process.on("SIGTERM", () => {
  bot.stop();
});

console.log("Bot started");
