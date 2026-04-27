import { jest } from "@jest/globals";

let _queue = [];

const inquirer = {
  prompt: jest.fn(async (questions) => {
    const answers = {};
    const qs = Array.isArray(questions) ? questions : [questions];
    for (const q of qs) {
      const next = _queue.shift();
      answers[q.name] = next !== undefined ? next : (q.default ?? "");
    }
    return answers;
  }),
  __setAnswers(arr) {
    _queue = [...arr];
  },
  __reset() {
    _queue = [];
  },
};

export default inquirer;
