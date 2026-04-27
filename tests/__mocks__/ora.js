// Stub for ora — spinner that does nothing
const spinner = {
  start: () => spinner,
  stop:  () => spinner,
  succeed: () => spinner,
  fail:    () => spinner,
  warn:    () => spinner,
  info:    () => spinner,
  isSpinning: false,
  text: '',
};
export default function ora() { return spinner; }
