import { OpenAIScriptProvider } from "./src/core/providers/openai.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const provider = new OpenAIScriptProvider();
async function run() {
  try {
    const sceneScript = "Мужчина стоит во дворе, прикрывая нос рукой, показывая недовольство.";
    const prompt = await provider.generateImagePrompt(sceneScript);
    console.log("PROMPT:", prompt);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
