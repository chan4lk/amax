import { z } from "zod";
import type { Tool } from "@amax/ai";

// 084: when a question has a few known answers that aren't writes (which project?), the model offers them as buttons;
// a click sends the answer as the user's next message. Nothing is written, so there's no card and no confirm.
export const ANSWER_TOOL = "offer_answers";

/** The question and its answers, shown as buttons under the reply until the next message. */
export type Answers = { question: string; options: string[] };

export const ANSWER_INSTRUCTIONS = `
When you ask the user a question that has 2 to 6 known answers and choosing one changes nothing by itself (for example,
which project), call ${ANSWER_TOOL} with the question and the answers instead of listing them in text. Each answer is
what the user would type, short and self-explanatory (for example "CON · Contoso Portal"). The user clicks one, or types
something else, as their next message. Reply with the question in one short line at most. Never offer answers to
something the user already said or that you can work out yourself (a day they called "today", a project they named or
pinned): use it and go on.`;

const Input = z.object({
  question: z.string().trim().min(3).max(200).describe("One short question, e.g. \"Which project is it for?\""),
  answers: z.array(z.string().trim().min(1).max(60)).min(2).max(6).describe("2 to 6 answers, each what the user would type"),
});

export function answerTool(set: (a: Answers) => void): Tool {
  return {
    name: ANSWER_TOOL,
    description: "Show the user 2 to 6 answers to your question as buttons; a click sends that answer as their next message. Writes nothing.",
    input: Input,
    run: async (raw: z.infer<typeof Input>) => {
      const options = [...new Set(raw.answers)];
      if (options.length < 2) return { status: "not_offered", note: "Give at least two different answers, or ask in text." };
      set({ question: raw.question, options });
      return { status: "awaiting_answer", note: "The user now sees these answers as buttons. Wait for their reply; don't assume one." };
    },
  } as Tool;
}
