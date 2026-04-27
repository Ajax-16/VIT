// Stub for chalk — returns the input string unchanged in all cases
const handler = { get: (_, prop) => prop === 'level' ? 3 : stub };
function stub(str) { return String(str ?? ''); }
stub.level = 3;

const proxy = new Proxy(stub, {
  get(target, prop) {
    if (prop === 'level') return 3;
    const chained = new Proxy(stub, handler);
    return chained;
  }
});

export default proxy;
