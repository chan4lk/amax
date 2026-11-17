const PROJECT_COLORS: Record<string, string> = { CON: "#7B61FF", FLT: "#F2A93B", HRI: "#F48B9B" };
const SPARE_COLORS = ["#2FCB8C", "#5CC8F0", "#B3A1FF", "#F2A93B", "#F48B9B", "#7B61FF"];
const AVATARS = ["a1", "a2", "a3", "a4"];

const sum = (text: string) => [...text].reduce((n, c) => n + c.charCodeAt(0), 0);

export const projectColor = (key: string | null, label: string) => (key && PROJECT_COLORS[key]) || SPARE_COLORS[sum(key ?? label) % SPARE_COLORS.length];
export const avatarClass = (name: string) => AVATARS[sum(name) % AVATARS.length];
export const round1 = (n: number) => Math.round(n * 10) / 10;

const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
export const inkOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const light = 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (light + 0.05) >= 4.5 ? "#FFFFFF" : "#1F1B3A";
};
export const firstName = (name: string) => name.split(" ")[0];
