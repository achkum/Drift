// OWNER: pipeline agent. Ask Drift: template answers computed from Insights. No network.
import type { AskAnswer, Insights } from '@/lib/types';

export function suggestedQuestions(insights: Insights): string[] {
  void insights;
  return [];
}

export function answerQuestion(question: string, insights: Insights): AskAnswer {
  void question; void insights;
  return { paragraphs: ['Not implemented yet.'], basis: '' };
}
