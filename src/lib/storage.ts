const readStorage = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
};

export const readBoolean = (key: string, fallback: boolean): boolean => {
  const raw = readStorage(key);
  if (raw === null) {
    return fallback;
  }

  return raw === "true";
};

export const writeBoolean = (key: string, value: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value ? "true" : "false");
};

export const readNumber = (key: string, fallback: number): number => {
  const raw = readStorage(key);
  if (raw === null) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const writeNumber = (key: string, value: number): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, String(value));
};

export const readJson = <T>(key: string, fallback: T): T => {
  const raw = readStorage(key);
  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = <T>(key: string, value: T): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};
