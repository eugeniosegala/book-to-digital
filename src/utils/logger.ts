let verboseEnabled = false;
let progressActive = false;

export const setVerbose = (enabled: boolean) => {
  verboseEnabled = enabled;
};

export const isVerbose = () => verboseEnabled;

const timestamp = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `\x1b[2m${h}:${m}:${s}\x1b[0m`;
};

const clearProgress = () => {
  if (progressActive) {
    process.stderr.write('\r\x1b[K');
    progressActive = false;
  }
};

export const info = (message: string) => {
  clearProgress();
  console.log(`${timestamp()} ${message}`);
};

export const warn = (message: string) => {
  clearProgress();
  console.warn(`${timestamp()} ⚠ ${message}`);
};

export const error = (message: string) => {
  clearProgress();
  console.error(`${timestamp()} ✖ ${message}`);
};

export const debug = (message: string) => {
  if (verboseEnabled) {
    clearProgress();
    console.log(`${timestamp()}   ${message}`);
  }
};

export const progress = (current: number, total: number, label = 'Processing') => {
  const pct = Math.round((current / total) * 100);
  const line = `${label}: ${current}/${total} (${pct}%)`;
  if (current === total) {
    clearProgress();
    console.log(`${timestamp()} ${line}`);
  } else {
    process.stderr.write(`\r\x1b[K${line}`);
    progressActive = true;
  }
};
