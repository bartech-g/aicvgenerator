import { z } from "zod";

export const Anecdote = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  situation: z.string(),
  action: z.string(),
  result: z.string(),
  skills: z.array(z.string()).default([]),
  metric: z.string().optional(),
});
export type Anecdote = z.infer<typeof Anecdote>;

export const AnecdoteBank = z.object({ anecdotes: z.array(Anecdote).default([]) });
export type AnecdoteBank = z.infer<typeof AnecdoteBank>;
